-- AlterTable
ALTER TABLE "recurring_items" ADD COLUMN     "anchorDate" TIMESTAMP(3);
ALTER TABLE "recurring_items" ADD COLUMN     "secondDayOfMonth" INTEGER;

-- AlterTable
ALTER TABLE "finance_transactions" ADD COLUMN     "recurringItemId" UUID;

-- CreateTable
CREATE TABLE "recurring_item_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recurringItemId" UUID NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "financeTransactionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_item_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_buckets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION,
    "targetDate" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bucket_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bucketId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "sourceRecurringItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bucket_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bucket_allocation_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recurringItemId" UUID NOT NULL,
    "bucketId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bucket_allocation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recurring_item_occurrences_financeTransactionId_key" ON "recurring_item_occurrences"("financeTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_item_occurrences_recurringItemId_occurrenceDate_key" ON "recurring_item_occurrences"("recurringItemId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_recurringItemId_fkey" FOREIGN KEY ("recurringItemId") REFERENCES "recurring_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_item_occurrences" ADD CONSTRAINT "recurring_item_occurrences_recurringItemId_fkey" FOREIGN KEY ("recurringItemId") REFERENCES "recurring_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_item_occurrences" ADD CONSTRAINT "recurring_item_occurrences_financeTransactionId_fkey" FOREIGN KEY ("financeTransactionId") REFERENCES "finance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_buckets" ADD CONSTRAINT "savings_buckets_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_entries" ADD CONSTRAINT "bucket_entries_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "savings_buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_entries" ADD CONSTRAINT "bucket_entries_sourceRecurringItemId_fkey" FOREIGN KEY ("sourceRecurringItemId") REFERENCES "recurring_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_allocation_rules" ADD CONSTRAINT "bucket_allocation_rules_recurringItemId_fkey" FOREIGN KEY ("recurringItemId") REFERENCES "recurring_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_allocation_rules" ADD CONSTRAINT "bucket_allocation_rules_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "savings_buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
