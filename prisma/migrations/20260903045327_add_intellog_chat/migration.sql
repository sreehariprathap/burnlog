-- CreateTable
CREATE TABLE "intel_chat_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intel_chat_threads_profileId_key" ON "intel_chat_threads"("profileId");

-- CreateIndex
CREATE INDEX "intel_chat_messages_threadId_createdAt_idx" ON "intel_chat_messages"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "intel_chat_threads" ADD CONSTRAINT "intel_chat_threads_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_chat_messages" ADD CONSTRAINT "intel_chat_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "intel_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
