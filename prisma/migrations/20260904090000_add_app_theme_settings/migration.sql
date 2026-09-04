-- CreateTable
CREATE TABLE "adminlog_app_theme_settings" (
    "id" TEXT NOT NULL,
    "primaryLight" TEXT,
    "backgroundLight" TEXT,
    "primaryDark" TEXT,
    "backgroundDark" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_app_theme_settings_pkey" PRIMARY KEY ("id")
);
