-- AlterTable
-- Signup no longer collects weight/height/activityLevel (moved to BurnLog's
-- own onboarding, not yet built) — these must accept null so the initial
-- profile insert succeeds for a user who hasn't set up BurnLog yet.
ALTER TABLE "profiles" ALTER COLUMN "weight" DROP NOT NULL;
ALTER TABLE "profiles" ALTER COLUMN "height" DROP NOT NULL;
ALTER TABLE "profiles" ALTER COLUMN "activityLevel" DROP NOT NULL;
