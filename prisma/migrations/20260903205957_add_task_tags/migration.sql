-- AlterTable
ALTER TABLE "tasklog_tasks" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
