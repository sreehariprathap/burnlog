-- Baseline migration: these changes were already applied directly to the
-- database (via `prisma db push` on a concurrent branch, not tracked
-- migrations), and are marked resolved via `prisma migrate resolve
-- --applied` rather than actually run. This file exists so migration
-- history reflects reality going forward.

-- CreateTable
CREATE TABLE "adminlog_toggles" (
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "globallyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adminlog_toggles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "adminlog_toggle_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "toggleKey" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "note" TEXT,
    "setByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adminlog_toggle_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adminlog_error_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" UUID,

    CONSTRAINT "adminlog_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adminlog_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "invitedByAdminId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedUpAt" TIMESTAMP(3),

    CONSTRAINT "adminlog_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adminlog_toggle_overrides_toggleKey_profileId_key" ON "adminlog_toggle_overrides"("toggleKey", "profileId");

-- AddForeignKey
ALTER TABLE "adminlog_toggle_overrides" ADD CONSTRAINT "adminlog_toggle_overrides_toggleKey_fkey" FOREIGN KEY ("toggleKey") REFERENCES "adminlog_toggles"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adminlog_toggle_overrides" ADD CONSTRAINT "adminlog_toggle_overrides_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adminlog_toggle_overrides" ADD CONSTRAINT "adminlog_toggle_overrides_setByAdminId_fkey" FOREIGN KEY ("setByAdminId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adminlog_error_logs" ADD CONSTRAINT "adminlog_error_logs_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adminlog_invites" ADD CONSTRAINT "adminlog_invites_invitedByAdminId_fkey" FOREIGN KEY ("invitedByAdminId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "grocery_lists" ADD COLUMN "planStartDate" TIMESTAMP(3);
