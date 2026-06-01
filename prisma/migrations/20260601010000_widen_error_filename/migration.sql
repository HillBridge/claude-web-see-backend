-- AlterTable: 加宽 filename 列, JS 报错的脚本 URL 常超过 255 字符会触发 P2000 丢上报
ALTER TABLE `error_reports` MODIFY `filename` VARCHAR(500) NULL;
ALTER TABLE `error_groups` MODIFY `filename` VARCHAR(500) NULL;
