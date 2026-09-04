-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN     "city" TEXT;
ALTER TABLE "profiles" ADD COLUMN     "postalCode" TEXT;

-- Backfill existing rows: Jan 1 of the inferred birth year. Lossy (no real
-- birthday), but every current consumer only ever needed a whole-number age.
UPDATE "profiles"
SET "dateOfBirth" = make_date((EXTRACT(YEAR FROM now())::int - "age"), 1, 1)
WHERE "dateOfBirth" IS NULL;

ALTER TABLE "profiles" ALTER COLUMN "dateOfBirth" SET NOT NULL;
ALTER TABLE "profiles" DROP COLUMN "age";
