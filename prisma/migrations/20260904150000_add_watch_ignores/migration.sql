-- CreateTable
CREATE TABLE "watch_ignores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_ignores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watch_ignores_profileId_tmdbId_mediaType_key" ON "watch_ignores"("profileId", "tmdbId", "mediaType");

-- AddForeignKey
ALTER TABLE "watch_ignores" ADD CONSTRAINT "watch_ignores_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
