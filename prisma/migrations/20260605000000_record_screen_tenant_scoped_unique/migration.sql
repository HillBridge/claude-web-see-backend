-- 录屏去重键由 recordScreenId 全局唯一改为 (apikey, recordScreenId) 复合唯一,
-- 防止攻击者用自己 apikey + 他人 recordScreenId 上报覆盖他人录屏(跨租户数据污染)。
-- 存量数据每个 record_screen_id 至多一行,迁移由「更严」到「更宽松」,不会产生唯一冲突。

-- DropIndex (复合唯一以 apikey 为最左前缀,原独立 apikey 索引被覆盖,冗余删除)
DROP INDEX `record_screens_apikey_idx` ON `record_screens`;

-- DropIndex (旧的 recordScreenId 全局唯一)
DROP INDEX `record_screens_record_screen_id_key` ON `record_screens`;

-- CreateIndex (新的 (apikey, recordScreenId) 复合唯一)
CREATE UNIQUE INDEX `record_screens_apikey_record_screen_id_key` ON `record_screens`(`apikey`, `record_screen_id`);
