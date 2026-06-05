# CLAUDE.md

本文件供 Claude Code 在本仓库工作时遵循。项目为 **Web-See 前端监控平台后端**：接收 SDK 上报的错误 / 性能 / 录屏 / 白屏数据并落库，提供多租户的查询管理接口。技术栈 NestJS 10 + Prisma 5 + MySQL + Redis + MinIO。

---

## 0. 红线规则（禁止改动 / 改动需先确认）

以下文件承载**安全、多租户隔离、数据正确性**，是全局基石。**未经我明确确认，禁止修改**；即使确认，也必须先单独说明影响面：

- **`src/common/utils/tenant-scope.ts`** — 多租户越权防护核心。所有查询接口靠它把数据限定在用户拥有的 apikey 范围内。改错 = 跨租户数据泄露。
- **`src/app.module.ts`** — 全局 Guard 顺序（先 JWT 再 Roles）、Interceptor、Filter 的装配点。顺序敏感。
- **`src/common/guards/`** 全目录 — `jwt-auth` / `roles` / `apikey-auth` / `rate-limit` / `auth-rate-limit`。鉴权与限流逻辑（含 `TRUST_PROXY` 防 XFF 伪造、域名精确匹配防前缀绕过）。
- **`src/config/configuration.ts`** — `requireEnv` 强制关键密钥（JWT_SECRET 等），缺失即拒绝启动。不得引入硬编码默认密钥。`recordScreen.encKey`（环境变量 `RECORD_SCREEN_ENC_KEY`）为录屏静态加密密钥，**可选**：未配置则录屏明文存储，配置后新写入即加密。
- **`src/shared/prisma/prisma.service.ts`** — 全局唯一 DB 访问点。
- **`prisma/schema.prisma`** 与 **`prisma/migrations/`** — 数据模型与迁移。尤其 `ErrorGroup` 的 `@@unique([apikey, fingerprint])` 去重指纹规则（schema 注释已说明指纹为何不含 fileName/lineNo/colNo）；以及 `RecordScreen` 的 `@@unique([apikey, recordScreenId])` 复合唯一（防跨租户覆盖，见 schema 注释）、events 已迁出 DB 改存 MinIO（仅留 `eventsKey`/`eventsSize`）。**禁止手改已应用的迁移文件**；模型变更必须走 `prisma migrate`。
- **`src/modules/report/report.controller.ts`** 及 `report.service.ts` — 唯一对外数据入口，承载体积兜底、`sendBeacon` text/plain 兼容、静默丢弃脏数据等约定。`saveRecordScreen` 还承载录屏写入链路：events 落 MinIO 前经 `record-screen-crypto` 加密（详见下方「录屏存储与加密流程」）。
- **`src/modules/record-screen/record-screen-crypto.ts`** 及 `record-screen.util.ts` — 录屏 events 的静态加密（AES-256-GCM）与 MinIO 对象 key 方案。改错 = 录屏不可读 / PII 明文泄露 / 跨对象 key 冲突。加解密各只一处（写在 report、读在 record-screen），算法与 key 方案集中于此两文件，**禁止在别处另起加解密或拼 key**。
- **`src/main.ts`** — bootstrap（body parser、CORS、全局前缀 exclude 列表、BigInt 序列化补丁、ValidationPipe）。

**绝对禁止触碰**：`.env*`（任何环境变量文件）、`node_modules/`、`dist/`、`prisma/migrations/` 下已存在的迁移目录。

### 录屏存储与加密流程（改 record-screen / report 任一环节前必读）

录屏 events 是 rrweb 的不透明 blob（SDK 端已 gzip+base64，后端只存不解析），**不入 DB，存 MinIO**，DB 仅留 `eventsKey`/`eventsSize`。可能含 PII，故落盘前做**静态加密**（AES-256-GCM），作为对象存储层的纵深防御。加解密对前端透明——API 返回的 `events` 始终是明文。

- **写入（加密）**：`POST /reportData`（type=`recordScreen`）→ `ReportService.saveRecordScreen`：
  `encryptEvents(明文, encKey)` → `putObject(key, blob)` → DB upsert 存 `eventsKey`/`eventsSize`（不存 events 内容）。
- **读取（解密）**：`GET /api/record-screens/:id` 等 → `RecordScreenService.loadEvents(eventsKey)`：
  `getObject(eventsKey)` → `decryptEvents(blob, encKey)` → 拼回 `events` 字段返回。
- **对象布局**：`[MAGIC("WSE1") | IV(12) | TAG(16) | CIPHERTEXT]`。读取按 `WSE1` 头区分「新密文 / 历史明文对象」，旧明文直通——**零迁移向后兼容**。
- **密钥可选**：`RECORD_SCREEN_ENC_KEY` 未配置 → 写入明文、读取直通（功能不受影响）；配置后新写入即加密。须 32 字节（base64/hex），长度非法启动即报错。
- **对象 key**：`record-screen/{apikey}/{recordScreenId}`（`record-screen.util.ts`），与 `@@unique([apikey, recordScreenId])` 的 upsert 覆盖语义一致（幂等）。
- **清理**：`CleanupService` 删 DB 行前先 `removeObject` 清 MinIO 对象，避免孤儿。
- **红线约束**：加密只在 `report`、解密只在 `record-screen`，算法/格式/key 方案集中在 `record-screen-crypto.ts` 与 `record-screen.util.ts`，**禁止在别处另起加解密或拼 key**；改对象布局/MAGIC 需保证对存量对象向后兼容。

---

## 1. 架构说明

```
src/
├── main.ts                  bootstrap：body parser / CORS / 全局前缀 / ValidationPipe / Swagger / BigInt 补丁
├── app.module.ts            根模块：装配模块 + 全局 Guard / Interceptor / Filter
├── config/configuration.ts  环境变量集中加载（requireEnv 强制校验）
│
├── common/                  横切关注点（被各业务模块复用）
│   ├── guards/              jwt-auth / roles / apikey-auth / rate-limit / auth-rate-limit
│   ├── interceptors/        transform（统一响应）/ logging（请求日志）
│   ├── filters/             http-exception（全局异常）
│   ├── decorators/          @Public / @Roles / @CurrentUser
│   ├── redis/               RedisModule + RedisService（token 白名单、限流计数）
│   ├── utils/tenant-scope   多租户数据隔离核心（resolveTenantApikeyFilter / assertApikeyAccess）
│   ├── dto/ interfaces/     分页 DTO、分页结果 / JWT payload 接口
│
├── shared/                  基础设施（全局共享 Provider）
│   ├── prisma/              PrismaService + PrismaModule
│   ├── logger/              nest-winston 日志
│   └── minio/               MinIO 对象存储（存 sourcemap 内容）
│
└── modules/                 业务模块（每个 = controller + service + module + dto/）
    ├── auth/                登录注册、JWT / 本地 Passport 策略
    ├── users/               用户管理
    ├── projects/            项目 / apikey 管理、域名白名单
    ├── report/              SDK 数据上报统一入口（错误 / 性能 / 录屏 / 白屏收口）
    ├── errors/              错误查询、分组聚合去重、详情、删除
    ├── performance/         性能数据查询（Web Vitals）
    ├── record-screen/       录屏数据（rrweb 事件流；events 存 MinIO 并静态加密，DB 仅存 key）
    ├── white-screen/        白屏检测数据
    ├── source-map/          sourcemap 上传（→MinIO）与堆栈还原
    └── cleanup/             定时任务：数据归档 / 清理（@Cron）
```

**分层约定**：`shared/` = 外部资源连接（DB / 日志 / 存储）；`common/` = 框架级横切逻辑（鉴权 / 限流 / 响应格式 / 租户隔离）。

**数据流**：SDK → `POST /reportData`（ApiKeyAuthGuard + RateLimitGuard）→ ReportService 分发落库。管理端 → 携带 JWT → 各模块查询接口 → 经 `tenant-scope` 限定 apikey 范围。

**数据库**（MySQL，10 张表）：`users / projects / error_reports / error_groups / breadcrumbs / performance_reports / performance_daily_stats / record_screens / source_map_files / white_screens`。

---

## 2. 执行前 / 中 / 后行为规范

### 执行前 · 必须
- **列出受影响文件清单**（路径 + 改动意图一句话）。
- **说明实现方案**，包含是否触及第 0 节红线文件；若触及，单独高亮并等我确认。
- **等我确认后再动手**。涉及多步的，先给整体计划。

### 执行中 · 必须
- **小步推进，到关键节点暂停**汇报，不要一口气改完一大片。
- **遇到设计分叉（多种合理方案 / 影响接口契约 / 影响 schema）让我决策**，不要自行替我选定。
- **不顺手改无关代码**：不重排 import、不批量改格式、不"顺便优化"未要求的部分。一次只做一件事。
- 改 Prisma 模型必须走迁移流程，不手改既有迁移。

### 执行后 · 必须
- **补充 / 更新测试**（见第 4 节；当前无测试框架则明确说明"未加测试及原因"，并提议如何补）。
- **给出改动清单**：逐文件列出改了什么。
- **说明副作用与风险**：是否影响接口契约、租户隔离、限流、迁移、定时任务等；需要的环境变量或迁移命令也一并列出。

---

## 3. 编码规范（提炼自现有代码风格）

- **语言/配置**：TypeScript 5，CommonJS，target ES2021。tsconfig 为**非严格模式**（`strictNullChecks: false`、`noImplicitAny: false`）——沿用，不要单独为某文件开严格。
- **命名**：文件 `kebab-case`，类 `PascalCase`，DB 字段 `snake_case`（Prisma 用 `@map` 映射到 camelCase）。
- **模块结构**：业务模块严格按 `controller / service / module / dto/` 切分，新功能沿用同构目录。
- **路径别名**：tsconfig 已定义 `@/ @common/ @modules/ @shared/ @prisma/ @config/ @logger/`。注意现状是**别名与相对路径混用**——新代码**与所在文件保持一致**，不要为统一风格去批量改动既有 import。
- **统一响应**：返回值由 `TransformInterceptor` 包成 `{ code, message, data, timestamp }`，业务代码直接 `return data` 即可。**上报类接口例外**（直接返回 `{ code, message }`）。
- **多租户**：所有查询类接口签名带 `@CurrentUser() user: TenantUser`，service 内必须经 `resolveTenantApikeyFilter`（列表）或 `assertApikeyAccess`（按 id 查单条）做归属校验。新增查询接口**默认就要做租户隔离**。
- **鉴权**：路由默认受全局 JwtAuthGuard 保护；公开接口用 `@Public()`；SDK 上报接口用 `@UseGuards(RateLimitGuard, ApiKeyAuthGuard)`。
- **校验**：入参用 class-validator DTO（全局 ValidationPipe 已开 `whitelist` + `forbidNonWhitelisted`）。SDK 上报因字段名不固定不套严格 DTO，改为 controller 内手动必填 + 体积兜底（见 report.controller 现有写法）。
- **时间戳**：用 `BigInt`，已在 main.ts 全局加 `toJSON` 补丁，勿重复处理。
- **注释**：中文注释密集，关键安全 / 设计决策**必须解释"为什么"**（参考 schema 指纹规则、rate-limit 的 XFF 信任说明）。延续这种密度。
- **密钥**：禁止硬编码任何密钥 / 默认口令，统一走 `configuration.ts` + 环境变量。
- **格式化**：仅 Prettier（`npm run format`，默认规则），无 ESLint。提交前对**改动文件**跑 format，不要全仓格式化。
- **旧接口兼容**：`reportData / getErrorList / getRecordScreenId / getmap` 不加 `/api` 前缀（main.ts exclude 列表），改动这些路由前先确认兼容性。

---

## 4. 测试规范

**现状：项目已具备两层测试**——

1. **单元测试**（Jest + ts-jest，配置 `jest.config.js`）：`src/**/*.spec.ts`，与被测文件同目录。**不连真实 DB/Redis/MinIO、不起 HTTP 服务**，全部 Mock。已覆盖 `tenant-scope`、各 Guard、限流、apikey/域名校验、错误去重指纹、录屏加解密等高风险逻辑。命令 `npm test`。
2. **E2E 测试**（Jest + supertest + **testcontainers**，配置 `test/jest-e2e.json`）：`test/**/*.e2e-spec.ts`，起真实 MySQL/Redis/MinIO 容器并跑真实 `prisma migrate deploy`，验证单测结构性测不到的**装配层契约**（全局 Guard 顺序、租户隔离接线、main.ts 全局接线、上报入口、录屏加解密往返）。命令 `npm run test:e2e`。详见 [`test/README.md`](test/README.md)。

要求：

- **不要假装运行测试**，也不要捏造测试通过。如实报告结果；测试失败就贴输出，跳过了就说跳过。
- **E2E 强依赖本机/CI 有可用的 Docker daemon**；无 Docker 时 E2E 无法运行，须如实说明，不得伪造通过。
- **验证方式**：
  - 单测：`npm test`（无需 Docker，快）。
  - E2E：`npm run test:e2e`（需 Docker；首次拉取镜像较慢）。
  - 编译检查：`npm run build`（`nest build`）必须通过。
  - 手动验证：`npm run start:dev` 启动后，非生产环境可用 Swagger（`http://localhost:<port>/swagger`）核对接口行为。
- **新增依赖**：本仓库用 **pnpm** 安装（npm 9.6.7 存在依赖树解析 bug，装 testcontainers/supertest 会报 `Cannot read properties of null (reading 'matches')`）。引入新测试框架/依赖属于结构性变更，**须先按第 2 节"执行前"流程说明并确认**。
- **关键契约提醒**（写 E2E 断言时勿踩坑）：全局 `HttpExceptionFilter`（`@Catch()`）把**所有异常的 HTTP 状态统一改写为 200**，真实状态码在响应体 `body.code`（含未匹配路由的 404）。鉴权/校验失败类断言应判 `res.body.code`，而非 HTTP status。成功响应经 `TransformInterceptor` 包成 `{ code, message, data, timestamp }`。
- 新增测试优先覆盖高风险逻辑：`tenant-scope`（租户隔离）、限流 Guard、apikey/域名校验、错误去重指纹（`report/utils/fingerprint`）、录屏加解密。

---

## 5. 常用命令

```bash
npm run start:dev          # 开发启动（watch，NODE_ENV=development）
npm run build              # 编译（提交前必跑）
npm test                   # 单元测试（Jest，Mock 依赖，无需 Docker）
npm run test:e2e           # E2E 测试（supertest + testcontainers，需 Docker）
npm run format             # Prettier 格式化 src/**/*.ts
npm run prisma:generate    # 生成 Prisma Client
npm run prisma:migrate:dev # 开发迁移（改 schema 后）
npm run prisma:studio      # 数据库可视化
npm run backfill:error-groups   # 回填错误分组
```
