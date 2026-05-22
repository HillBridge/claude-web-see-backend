-- CreateTable
CREATE TABLE `source_map_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fileName` VARCHAR(255) NOT NULL,
    `apikey` VARCHAR(64) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `source_map_files_apikey_idx`(`apikey`),
    UNIQUE INDEX `source_map_files_fileName_apikey_key`(`fileName`, `apikey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
