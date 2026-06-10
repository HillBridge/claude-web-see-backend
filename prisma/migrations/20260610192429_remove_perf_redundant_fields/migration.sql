-- 移除 performance_reports 冗余字段: time/monitor_user_id/sdk_version/device_info
-- 这 4 列仅在上报时写入,全仓无任何查询/聚合/过滤/排序引用(纯写入零读取)。
-- time 与 created_at 时间语义重叠且从未参与分析;另 3 列在错误/录屏/白屏表有用,
-- 但在性能表属"随上报体顺手存却无人消费",删除以减小行宽与写放大。
-- AlterTable
ALTER TABLE `performance_reports` DROP COLUMN `device_info`,
    DROP COLUMN `monitor_user_id`,
    DROP COLUMN `sdk_version`,
    DROP COLUMN `time`;
