-- 清空历史脏数据(指标全 NULL 的空壳行,零信息);并为新增 NOT NULL 列腾空表
TRUNCATE TABLE `performance_reports`;

-- AlterTable
ALTER TABLE `performance_reports` DROP COLUMN `cls`,
    DROP COLUMN `dns`,
    DROP COLUMN `fcp`,
    DROP COLUMN `fid`,
    DROP COLUMN `fp`,
    DROP COLUMN `lcp`,
    DROP COLUMN `load_time`,
    DROP COLUMN `ssl`,
    DROP COLUMN `tcp`,
    DROP COLUMN `ttfb`,
    ADD COLUMN `detail` JSON NULL,
    ADD COLUMN `name` VARCHAR(32) NOT NULL,
    ADD COLUMN `rating` VARCHAR(20) NULL,
    ADD COLUMN `value` DECIMAL(12, 4) NULL;

-- CreateIndex
CREATE INDEX `performance_reports_apikey_name_idx` ON `performance_reports`(`apikey`, `name`);

