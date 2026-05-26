# web-see-backend

前端监控平台服务端，NestJS + Prisma + MySQL + MinIO。

## 数据存储与生命周期

### MinIO（SourceMap 文件）

服务启动时自动对 bucket 设置 180 天生命周期规则，过期文件由 MinIO 自动清除，无需手动干预。

### MySQL（监控数据）

每天凌晨 3:17 执行清理任务（`CleanupService`），执行顺序如下：

| 数据类型 | 表名 | 保留时长 | 处理方式 |
|---|---|---|---|
| 性能原始数据 | `performance_reports` | 30 天 | 先聚合为日统计，再删除原始行 |
| 性能日聚合 | `performance_daily_stats` | 365 天 | 到期直接删除 |
| 错误上报 + 行为轨迹 | `error_reports` / `breadcrumbs` | 90 天 | 删 error_reports，breadcrumbs 级联删除 |
| 录屏数据 | `record_screens` | 30 天 | 直接删除（LongText，存储压力最大） |
| 白屏数据 | `white_screens` | 90 天 | 直接删除 |

性能数据聚合逻辑：将 30~365 天前的原始数据按 `(apikey, 日期)` 分组取均值，upsert 进 `performance_daily_stats`，保留趋势分析能力的同时释放原始行占用的空间。

## 启动

```bash
pnpm install
pnpm prisma:migrate:prod
pnpm start:dev
```
