-- 清理历史 drift: source_map_files.minio_key 残留的 DEFAULT ''。
-- 该列在 20260525100000 迁移中为给已有表加 NOT NULL 列而临时用 DEFAULT '' 回填,
-- 但 schema 模型从未声明 @default,且写入路径(source-map.service uploadMapFile)
-- 在 create/update 两分支均显式写入 minioKey,故空串 default 既无意义又掩盖脏数据。
-- 删除后使 DB 与 schema 对齐;插入缺失 minioKey 将正确报错而非静默落空串。

ALTER TABLE `source_map_files` ALTER COLUMN `minio_key` DROP DEFAULT;
