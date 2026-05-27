-- AlterTable
ALTER TABLE `error_reports`
  ADD COLUMN `line_no` INT NULL,
  ADD COLUMN `col_no`  INT NULL;
