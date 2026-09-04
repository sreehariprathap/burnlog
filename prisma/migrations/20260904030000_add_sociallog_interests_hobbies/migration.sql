-- AlterTable
ALTER TABLE "social_profile_settings" ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "social_profile_settings" ADD COLUMN     "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[];
