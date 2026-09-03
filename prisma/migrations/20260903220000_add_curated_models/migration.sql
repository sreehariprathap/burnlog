-- CreateTable
CREATE TABLE "ai_model_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "isFree" BOOLEAN NOT NULL,
    "contextLength" INTEGER,
    "addedByAdminId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_catalog_modelId_key" ON "ai_model_catalog"("modelId");

-- AddForeignKey
ALTER TABLE "ai_model_catalog" ADD CONSTRAINT "ai_model_catalog_addedByAdminId_fkey" FOREIGN KEY ("addedByAdminId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
