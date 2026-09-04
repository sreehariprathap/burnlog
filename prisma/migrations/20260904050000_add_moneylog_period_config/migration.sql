-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "moneylogYearStartMonth" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "profiles" ADD COLUMN     "moneylogMonthStartDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "profiles" ADD COLUMN     "moneylogWeekStart" TEXT NOT NULL DEFAULT 'monday';
