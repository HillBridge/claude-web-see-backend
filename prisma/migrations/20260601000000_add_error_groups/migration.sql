-- CreateTable
CREATE TABLE `error_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apikey` VARCHAR(64) NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `message` TEXT NULL,
    `filename` VARCHAR(255) NULL,
    `line_no` INTEGER NULL,
    `col_no` INTEGER NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `first_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `error_groups_apikey_fingerprint_key`(`apikey`, `fingerprint`),
    INDEX `error_groups_apikey_idx`(`apikey`),
    INDEX `error_groups_type_idx`(`type`),
    INDEX `error_groups_last_seen_idx`(`last_seen`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `error_reports` ADD COLUMN `error_group_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `error_reports_error_group_id_idx` ON `error_reports`(`error_group_id`);

-- AddForeignKey
ALTER TABLE `error_reports` ADD CONSTRAINT `error_reports_error_group_id_fkey` FOREIGN KEY (`error_group_id`) REFERENCES `error_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
