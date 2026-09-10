-- CreateTable
CREATE TABLE "burnlog_workout_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "burnlog_workout_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "burnlog_workout_types_label_key" ON "burnlog_workout_types"("label");

-- Seed the existing hardcoded BODY_PARTS list so the dropdown starts non-empty
INSERT INTO "burnlog_workout_types" ("label", "sortOrder") VALUES
    ('Push', 0),
    ('Pull', 1),
    ('Legs', 2),
    ('Full Body', 3),
    ('Cardio', 4),
    ('Rest', 5),
    ('Bodyweight', 6),
    ('Outdoor Cardio', 7),
    ('Active Commute', 8);
