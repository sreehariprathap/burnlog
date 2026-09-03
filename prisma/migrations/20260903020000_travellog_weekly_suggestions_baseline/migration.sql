-- Baseline migration recording schema changes that were applied directly
-- to the shared dev database by a concurrent branch without ever
-- committing a migration file (travellog_weekly_suggestions table,
-- profiles.weeklyTripSuggestionsEnabled column). Reconstructed from the
-- TravelSuggestion model in prisma/schema.prisma to reconcile migration
-- history with the database's real state.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "weeklyTripSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "travellog_weekly_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travellog_weekly_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travellog_weekly_suggestions_profileId_weekOf_idx" ON "travellog_weekly_suggestions"("profileId", "weekOf");

-- AddForeignKey
ALTER TABLE "travellog_weekly_suggestions" ADD CONSTRAINT "travellog_weekly_suggestions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
