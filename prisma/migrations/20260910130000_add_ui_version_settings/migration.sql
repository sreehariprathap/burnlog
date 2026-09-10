-- CreateTable
CREATE TABLE "adminlog_ui_version_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_ui_version_settings_pkey" PRIMARY KEY ("id")
);
