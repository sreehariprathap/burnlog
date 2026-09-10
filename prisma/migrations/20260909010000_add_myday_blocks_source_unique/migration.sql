-- CreateIndex
CREATE UNIQUE INDEX "myday_blocks_source_unique"
  ON "myday_blocks" ("profileId", "source", "sourceId")
  WHERE "sourceId" IS NOT NULL;
