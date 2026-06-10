-- 清理历史非标量事件行(longTask/resourceList/memory): 不参与分析、占大量行,入库层已停止采集
DELETE FROM `performance_reports` WHERE `name` IN ('longTask', 'resourceList', 'memory');

-- 移除 detail 列(仅服务于已丢弃的非标量事件,标量指标不使用)
-- AlterTable
ALTER TABLE `performance_reports` DROP COLUMN `detail`;

