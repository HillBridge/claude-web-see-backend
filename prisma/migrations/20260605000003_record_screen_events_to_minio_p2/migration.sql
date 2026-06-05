-- 阶段2/2: 录屏 events 迁移到 MinIO —— 删除已迁移完毕的 events 列。
-- 前置: 必须已运行 `npm run backfill:record-screen-minio` 将存量 events 全部迁至 MinIO
-- (events_key 已回填),否则将丢失历史录屏。本仓执行时已校验 events_key IS NULL 行数为 0。
ALTER TABLE `record_screens` DROP COLUMN `events`;
