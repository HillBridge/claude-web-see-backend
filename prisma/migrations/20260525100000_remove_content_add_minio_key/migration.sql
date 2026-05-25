-- 删除 content 大字段，改为 minio_key 元数据字段
ALTER TABLE `source_map_files` DROP COLUMN `content`;
ALTER TABLE `source_map_files` ADD COLUMN `minio_key` VARCHAR(512) NOT NULL DEFAULT '';
