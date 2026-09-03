-- DropIndex
DROP INDEX "intel_chat_threads_profileId_key";

-- AlterTable
ALTER TABLE "intel_chat_threads"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "modelId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "intel_chat_threads_profileId_updatedAt_idx" ON "intel_chat_threads"("profileId", "updatedAt");
