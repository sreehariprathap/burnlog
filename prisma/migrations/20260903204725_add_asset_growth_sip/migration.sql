-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "expectedGrowthRate" DOUBLE PRECISION,
ADD COLUMN     "investedValue" DOUBLE PRECISION,
ADD COLUMN     "sipAmount" DOUBLE PRECISION,
ADD COLUMN     "sipEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sipFrequency" TEXT;
