-- 阶段1/2: 录屏 events 迁移到 MinIO —— 先加列、放宽 events 为可空(过渡期保留供回填)。
-- 阶段2迁移再删除 events 列。此步零数据丢失:既有 events 仍在,新增 events_key/events_size。
ALTER TABLE `record_screens` ADD COLUMN `events_key` VARCHAR(512) NULL,
    ADD COLUMN `events_size` INTEGER NULL,
    MODIFY `events` LONGTEXT NULL;
