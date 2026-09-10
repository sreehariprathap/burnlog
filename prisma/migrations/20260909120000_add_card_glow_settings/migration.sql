-- CreateTable
CREATE TABLE "adminlog_card_glow_settings" (
    "id" TEXT NOT NULL,
    "preset" TEXT NOT NULL DEFAULT 'subtle',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_card_glow_settings_pkey" PRIMARY KEY ("id")
);
