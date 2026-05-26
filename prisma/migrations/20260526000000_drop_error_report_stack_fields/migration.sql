-- AlterTable
ALTER TABLE `error_reports`
  DROP COLUMN `sub_type`,
  DROP COLUMN `stack`,
  DROP COLUMN `filename`,
  DROP COLUMN `line_no`,
  DROP COLUMN `col_no`;
