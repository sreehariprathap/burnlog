-- CreateTable
CREATE TABLE "adminlog_color_combos" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "primaryLight" TEXT NOT NULL,
    "primaryDark" TEXT NOT NULL,
    "backgroundLight" TEXT NOT NULL,
    "backgroundDark" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_color_combos_pkey" PRIMARY KEY ("id")
);
