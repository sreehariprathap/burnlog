-- CreateTable
CREATE TABLE "food_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mealType" TEXT,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "exercises" JSONB NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_favorites_profileId_name_key" ON "food_favorites"("profileId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workout_templates_profileId_name_key" ON "workout_templates"("profileId", "name");

-- AddForeignKey
ALTER TABLE "food_favorites" ADD CONSTRAINT "food_favorites_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
