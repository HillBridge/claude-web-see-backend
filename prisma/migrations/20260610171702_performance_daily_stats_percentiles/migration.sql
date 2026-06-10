-- 清空旧聚合行(源自垃圾原始数据,零价值);并为新增 NOT NULL 列(page/name)与新唯一键腾空表
TRUNCATE TABLE `performance_daily_stats`;

-- DropIndex
DROP INDEX `performance_daily_stats_apikey_idx` ON `performance_daily_stats`;

-- DropIndex
DROP INDEX `performance_daily_stats_stat_date_apikey_key` ON `performance_daily_stats`;

-- DropIndex
DROP INDEX `performance_daily_stats_stat_date_idx` ON `performance_daily_stats`;

-- AlterTable
ALTER TABLE `performance_daily_stats` DROP COLUMN `avg_cls`,
    DROP COLUMN `avg_dns`,
    DROP COLUMN `avg_fcp`,
    DROP COLUMN `avg_fid`,
    DROP COLUMN `avg_fp`,
    DROP COLUMN `avg_lcp`,
    DROP COLUMN `avg_load_time`,
    DROP COLUMN `avg_ssl`,
    DROP COLUMN `avg_tcp`,
    DROP COLUMN `avg_ttfb`,
    ADD COLUMN `avg_value` DECIMAL(12, 4) NULL,
    ADD COLUMN `good_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `name` VARCHAR(32) NOT NULL,
    ADD COLUMN `ni_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `p75` DECIMAL(12, 4) NULL,
    ADD COLUMN `p95` DECIMAL(12, 4) NULL,
    ADD COLUMN `page` VARCHAR(255) NOT NULL,
    ADD COLUMN `poor_count` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `performance_daily_stats_apikey_stat_date_idx` ON `performance_daily_stats`(`apikey`, `stat_date`);

-- CreateIndex
CREATE INDEX `performance_daily_stats_apikey_page_name_idx` ON `performance_daily_stats`(`apikey`, `page`, `name`);

-- CreateIndex
CREATE UNIQUE INDEX `performance_daily_stats_stat_date_apikey_page_name_key` ON `performance_daily_stats`(`stat_date`, `apikey`, `page`, `name`);

