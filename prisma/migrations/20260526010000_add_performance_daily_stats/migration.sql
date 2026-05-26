-- CreateTable
CREATE TABLE `performance_daily_stats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stat_date` DATE NOT NULL,
    `apikey` VARCHAR(64) NOT NULL,
    `sample_count` INTEGER NOT NULL,
    `avg_fp` DECIMAL(10, 2) NULL,
    `avg_fcp` DECIMAL(10, 2) NULL,
    `avg_lcp` DECIMAL(10, 2) NULL,
    `avg_fid` DECIMAL(10, 2) NULL,
    `avg_cls` DECIMAL(10, 4) NULL,
    `avg_ttfb` DECIMAL(10, 2) NULL,
    `avg_dns` DECIMAL(10, 2) NULL,
    `avg_tcp` DECIMAL(10, 2) NULL,
    `avg_ssl` DECIMAL(10, 2) NULL,
    `avg_load_time` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `performance_daily_stats_apikey_idx`(`apikey`),
    INDEX `performance_daily_stats_stat_date_idx`(`stat_date`),
    UNIQUE INDEX `performance_daily_stats_stat_date_apikey_key`(`stat_date`, `apikey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
