-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "watchlogFavoriteGenres" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN     "watchlogContentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
