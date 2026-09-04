-- CreateTable
CREATE TABLE "adminlog_typography_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "headingFont" TEXT NOT NULL DEFAULT 'quicksand',
    "bodyFont" TEXT NOT NULL DEFAULT 'figtree',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_typography_settings_pkey" PRIMARY KEY ("id")
);
