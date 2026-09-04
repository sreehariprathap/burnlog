-- CreateTable
CREATE TABLE "travellog_passport_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travellog_passport_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travellog_passport_entries_profileId_country_state_key" ON "travellog_passport_entries"("profileId", "country", "state");

-- AddForeignKey
ALTER TABLE "travellog_passport_entries" ADD CONSTRAINT "travellog_passport_entries_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
