-- AlterTable
ALTER TABLE `error_reports` ADD COLUMN `elapsed_time` INTEGER NULL,
    ADD COLUMN `http_type` VARCHAR(10) NULL,
    ADD COLUMN `request_data` TEXT NULL,
    ADD COLUMN `request_method` VARCHAR(10) NULL,
    ADD COLUMN `request_url` VARCHAR(500) NULL,
    ADD COLUMN `response_data` TEXT NULL,
    ADD COLUMN `response_status` INTEGER NULL;

