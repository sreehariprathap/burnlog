-- CreateTable
CREATE TABLE "adminlog_lottie_animations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'lottie',
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "data" JSONB,
    "createdByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adminlog_lottie_animations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adminlog_lottie_assignments" (
    "appId" TEXT NOT NULL,
    "animationId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" UUID,

    CONSTRAINT "adminlog_lottie_assignments_pkey" PRIMARY KEY ("appId")
);

-- AddForeignKey
ALTER TABLE "adminlog_lottie_assignments" ADD CONSTRAINT "adminlog_lottie_assignments_animationId_fkey" FOREIGN KEY ("animationId") REFERENCES "adminlog_lottie_animations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
