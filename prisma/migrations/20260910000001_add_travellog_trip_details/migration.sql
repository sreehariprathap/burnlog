-- AlterTable
ALTER TABLE "travellog_plans" ADD COLUMN     "origin" TEXT,
ADD COLUMN     "departureTime" TEXT,
ADD COLUMN     "returnTime" TEXT,
ADD COLUMN     "accommodationBooked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accommodationNights" INTEGER,
ADD COLUMN     "accommodationPaid" DOUBLE PRECISION;
