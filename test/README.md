# E2E 测试说明

本目录是 **端到端（E2E）测试**，与 `src/**/*.spec.ts` 单元测试相互独立、互不加载。

- 单元测试：`jest.config.js`，Mock 掉 DB/Redis/MinIO，命令 `pnpm test`。
- E2E 测试：`test/jest-e2e.json`，起**真实** MySQL/Redis/MinIO 容器，命令 `pnpm run test:e2e`。

E2E 验证的是单测结构性测不到的**装配层契约**：全局 Guard 顺序、多租户隔离接线、`main.ts` 全局接线、SDK 上报入口、录屏加解密往返。

## 前置条件

- **本机/CI 必须有可用的 Docker daemon**（testcontainers 依赖）。无 Docker 时 E2E 无法运行。
- 首次运行会拉取镜像：`mysql:8`、`redis:7`、`minio/minio`、`testcontainers/ryuk`（拉取较慢，之后走本地缓存）。

## 运行

```bash
pnpm run test:e2e
```

无需手动起数据库——`test/setup/global-setup.ts` 会自动起容器、注入连接环境变量、执行真实 `prisma migrate deploy` 建表；`global-teardown.ts` 在结束后销毁容器。

> 已禁用 testcontainers 的 ryuk 资源回收器（偶发端口绑定超时），改由 `global-teardown` 显式停容器兜底。

## 目录结构

```
test/
├── jest-e2e.json                 # 独立 jest 配置（testRegex=*.e2e-spec.ts，runInBand）
├── setup/
│   ├── containers.ts             # 起/停 MySQL+Redis+MinIO 容器，导出连接 env
│   ├── global-setup.ts           # 全局：起容器 → 注入 env → prisma migrate deploy
│   ├── global-teardown.ts        # 全局：停容器
│   ├── app-factory.ts            # createTestApp()：用真实 AppModule 启动，并复刻 main.ts bootstrap
│   └── seed.ts                   # 种子/复位助手（注册/登录/造数据/清库+清 Redis）
├── auth-and-guards.e2e-spec.ts   # A · 鉴权装配 & Guard 顺序
├── tenant-isolation.e2e-spec.ts  # B · 多租户越权
├── report-ingest.e2e-spec.ts     # C · SDK 上报入口契约
├── global-wiring.e2e-spec.ts     # D · 全局接线（前缀/ValidationPipe/BigInt）
└── record-screen-crypto.e2e-spec.ts  # E · 录屏 events 静态加密往返
```

## 写 E2E 断言时必须知道的两个契约

1. **HTTP 状态恒为 200，真实码在 `body.code`。**
   全局 `HttpExceptionFilter`（`@Catch()`）捕获所有异常并以 `HttpStatus.OK` 返回，把真实状态码放进响应体 `code` 字段（连未匹配路由的 404 也是如此）。
   所以鉴权/校验失败类用例应断言 `res.body.code`（如 `expect(res.body.code).toBe(401)`），**不要**用 supertest 的 `.expect(401)`。
   成功响应经 `TransformInterceptor` 统一包成 `{ code, message, data, timestamp }`，业务数据在 `res.body.data`。
   例外：`POST /reportData` 用了 `@HttpCode(200)`，其成功响应 HTTP 与 body 内层都是 200。

2. **限流/白名单共享 Redis，必须每个用例前 flush。**
   `AuthRateLimitGuard`（登录/注册 5 次/分钟/IP）与 token 白名单都落在共享的 Redis 容器，`resetDb` 不清 Redis。
   故 `setup/seed.ts` 的 `resetState()` 会先 `flushdb()` 再清库——**必须在注册/登录之前调用**，这样用例内新建的 token 仍然有效。所有 spec 的 `beforeEach` 都应调用 `resetState(app, prisma)`。

## 依赖安装注意

本仓库用 **pnpm** 安装依赖。npm 9.6.7 存在依赖树解析 bug，安装 `testcontainers`/`supertest` 时会报
`npm ERR! Cannot read properties of null (reading 'matches')`。

```bash
pnpm add -D testcontainers @testcontainers/mysql @testcontainers/redis supertest @types/supertest
```
