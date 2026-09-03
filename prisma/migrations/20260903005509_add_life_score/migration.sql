-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "lifeScoreMode" TEXT NOT NULL DEFAULT 'engagement';

-- CreateTable
CREATE TABLE "life_score_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "engagementScore" INTEGER,
    "streakScore" INTEGER,
    "goalScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "life_score_snapshots_profileId_date_key" ON "life_score_snapshots"("profileId", "date");

-- AddForeignKey
ALTER TABLE "life_score_snapshots" ADD CONSTRAINT "life_score_snapshots_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
