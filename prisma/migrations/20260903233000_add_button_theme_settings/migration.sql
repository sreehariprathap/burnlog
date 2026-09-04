-- CreateTable
CREATE TABLE "adminlog_button_theme_settings" (
    "slot" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'default',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_button_theme_settings_pkey" PRIMARY KEY ("slot")
);
