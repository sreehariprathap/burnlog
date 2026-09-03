-- CreateTable
CREATE TABLE "intel_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "app" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_cohort_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cohortKey" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "p25" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,

    CONSTRAINT "intel_cohort_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "app" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "intel_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intel_snapshots_profileId_date_idx" ON "intel_snapshots"("profileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "intel_snapshots_profileId_app_date_key" ON "intel_snapshots"("profileId", "app", "date");

-- CreateIndex
CREATE UNIQUE INDEX "intel_cohort_stats_cohortKey_app_metric_date_key" ON "intel_cohort_stats"("cohortKey", "app", "metric", "date");

-- CreateIndex
CREATE INDEX "intel_suggestions_profileId_status_createdAt_idx" ON "intel_suggestions"("profileId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "intel_snapshots" ADD CONSTRAINT "intel_snapshots_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_suggestions" ADD CONSTRAINT "intel_suggestions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
