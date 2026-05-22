-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `apikey` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `owner_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_apikey_key`(`apikey`),
    INDEX `projects_owner_id_idx`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `error_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(50) NOT NULL,
    `sub_type` VARCHAR(50) NULL,
    `message` TEXT NULL,
    `page_url` VARCHAR(500) NULL,
    `time` BIGINT NULL,
    `apikey` VARCHAR(64) NOT NULL,
    `monitor_user_id` VARCHAR(100) NULL,
    `sdk_version` VARCHAR(20) NULL,
    `device_info` JSON NULL,
    `record_screen_id` VARCHAR(64) NULL,
    `stack` TEXT NULL,
    `filename` VARCHAR(500) NULL,
    `line_no` INTEGER NULL,
    `col_no` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `error_reports_apikey_idx`(`apikey`),
    INDEX `error_reports_type_idx`(`type`),
    INDEX `error_reports_record_screen_id_idx`(`record_screen_id`),
    INDEX `error_reports_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `breadcrumbs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `error_report_id` INTEGER NOT NULL,
    `category` VARCHAR(50) NULL,
    `data` JSON NULL,
    `status` VARCHAR(20) NULL,
    `time` BIGINT NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `breadcrumbs_error_report_id_idx`(`error_report_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `performance_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `page_url` VARCHAR(500) NULL,
    `time` BIGINT NULL,
    `apikey` VARCHAR(64) NOT NULL,
    `monitor_user_id` VARCHAR(100) NULL,
    `sdk_version` VARCHAR(20) NULL,
    `device_info` JSON NULL,
    `fp` DECIMAL(10, 2) NULL,
    `fcp` DECIMAL(10, 2) NULL,
    `lcp` DECIMAL(10, 2) NULL,
    `fid` DECIMAL(10, 2) NULL,
    `cls` DECIMAL(10, 4) NULL,
    `ttfb` DECIMAL(10, 2) NULL,
    `dns` DECIMAL(10, 2) NULL,
    `tcp` DECIMAL(10, 2) NULL,
    `ssl` DECIMAL(10, 2) NULL,
    `load_time` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `performance_reports_apikey_idx`(`apikey`),
    INDEX `performance_reports_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `record_screens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_screen_id` VARCHAR(64) NOT NULL,
    `events` LONGTEXT NOT NULL,
    `apikey` VARCHAR(64) NULL,
    `monitor_user_id` VARCHAR(100) NULL,
    `page_url` VARCHAR(500) NULL,
    `time` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `record_screens_record_screen_id_key`(`record_screen_id`),
    INDEX `record_screens_record_screen_id_idx`(`record_screen_id`),
    INDEX `record_screens_apikey_idx`(`apikey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `white_screens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `page_url` VARCHAR(500) NULL,
    `time` BIGINT NULL,
    `apikey` VARCHAR(64) NULL,
    `monitor_user_id` VARCHAR(100) NULL,
    `sdk_version` VARCHAR(20) NULL,
    `device_info` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `white_screens_apikey_idx`(`apikey`),
    INDEX `white_screens_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `breadcrumbs` ADD CONSTRAINT `breadcrumbs_error_report_id_fkey` FOREIGN KEY (`error_report_id`) REFERENCES `error_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
