-- CreateTable
CREATE TABLE "watch_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterPath" TEXT,
    "releaseYear" INTEGER,
    "runtimeMinutes" INTEGER,
    "genres" TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'want',
    "rating" INTEGER,
    "currentSeason" INTEGER,
    "currentEpisode" INTEGER,
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watch_items_profileId_status_idx" ON "watch_items"("profileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "watch_items_profileId_tmdbId_mediaType_key" ON "watch_items"("profileId", "tmdbId", "mediaType");

-- AddForeignKey
ALTER TABLE "watch_items" ADD CONSTRAINT "watch_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
