-- Make headingFont/bodyFont nullable (per-app rows may leave them unset to
-- inherit from "global"), drop their old string defaults, and add the new
-- weight/scale columns.
ALTER TABLE "adminlog_typography_settings"
  ALTER COLUMN "headingFont" DROP DEFAULT,
  ALTER COLUMN "headingFont" DROP NOT NULL,
  ALTER COLUMN "bodyFont" DROP DEFAULT,
  ALTER COLUMN "bodyFont" DROP NOT NULL,
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "adminlog_typography_settings"
  ADD COLUMN "headingWeight" INTEGER,
  ADD COLUMN "bodyWeight" INTEGER,
  ADD COLUMN "headingScale" DOUBLE PRECISION;
