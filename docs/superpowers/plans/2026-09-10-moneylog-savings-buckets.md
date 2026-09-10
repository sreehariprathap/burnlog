# MoneyLog Savings Buckets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add savings buckets (named goal funds with manual + auto-rule contributions), biweekly/semimonthly recurring frequencies, an occurrence-logging mechanism for recurring items, and a "spendable this period" tracker to MoneyLog.

**Architecture:** Four new Prisma tables (`RecurringItemOccurrence`, `SavingsBucket`, `BucketEntry`, `BucketAllocationRule`) plus additive columns on `RecurringItem`/`FinanceTransaction`. New Next.js Route Handlers under `app/api/moneylog/` (service-role pattern, matching `assets/route.ts`) for all bucket and occurrence-logging writes, since they touch multiple tables per request. New UI under `app/(moneylog)/moneylog/buckets/`, plus additions to the Home screen and the recurring-item form.

**Tech Stack:** Next.js App Router, Prisma + Supabase (service-role client for writes), date-fns, shadcn/ui, SWR, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-moneylog-savings-buckets-design.md`

## Global Constraints

- All new DB columns/tables are additive and nullable where new — no backfill, no breaking existing rows (spec: Migration section).
- New tables are written exclusively through service-role Route Handlers, matching `assets`/`balance`/`pay` — no RLS policies needed (existing precedent: `assets` table has none either).
- Money fields use `Float`, matching every existing amount column in `prisma/schema.prisma` — do not introduce `Decimal` as a one-off.
- String-enum fields (`type`, `source`, `mode`, `frequency`) follow the existing convention: plain `String` column with a `//` comment listing allowed values, not a Prisma `enum`.
- No auto-rule validation that percentages sum to ≤100% (spec: explicitly out of scope).
- Bucket withdrawals never create a `FinanceTransaction` and never feed the spendable formula (spec: buckets are a fully separate ledger).

---

## Task 1: Schema migration — new tables and columns

**Files:**
- Modify: `prisma/schema.prisma` (RecurringItem block at line 558-577, FinanceTransaction block at line 579-595, Profile relations block around line 78)
- Create: `prisma/migrations/20260910120000_add_savings_buckets/migration.sql`

**Interfaces:**
- Produces: Prisma models `RecurringItemOccurrence`, `SavingsBucket`, `BucketEntry`, `BucketAllocationRule`; `RecurringItem.frequency` now allows `'biweekly' | 'semimonthly'`; `RecurringItem.anchorDate: DateTime?`, `RecurringItem.secondDayOfMonth: Int?`; `FinanceTransaction.recurringItemId: String?`. All later tasks' Prisma Client calls (`admin.from('savings_buckets')`, etc.) depend on this migration having run.

- [ ] **Step 1: Edit `RecurringItem` in `prisma/schema.prisma`**

Replace lines 558-577:

```prisma
/// recurring income/expense templates — expanded into period ranges at read time, never materialized into rows
model RecurringItem {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile  @relation(fields: [profileId], references: [id])
  profileId   String   @db.Uuid
  type        String // 'income' | 'expense'
  category    String // e.g. 'salary', 'rent', 'mobile_bill', 'other_expense'
  label       String // user-facing name, e.g. "Rent"
  amount      Float
  frequency   String // 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'semimonthly'
  dayOfWeek   Int? // 0-6, used when frequency = 'weekly'
  dayOfMonth  Int? // 1-31, used when frequency = 'monthly' | 'yearly' | 'semimonthly' (first date)
  monthOfYear Int? // 1-12, used when frequency = 'yearly'
  anchorDate       DateTime? // reference payday for 'biweekly' — occurrences fall every 14 days from this date
  secondDayOfMonth Int? // second calendar day for 'semimonthly' (first date reuses dayOfMonth); 0 means "last day of month"
  startDate   DateTime @default(now())
  endDate     DateTime?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  occurrences     RecurringItemOccurrence[]
  transactions    FinanceTransaction[]
  bucketEntries   BucketEntry[]
  allocationRules BucketAllocationRule[]

  @@map("recurring_items")
}
```

- [ ] **Step 2: Edit `FinanceTransaction` in `prisma/schema.prisma`**

Replace lines 579-595 (the `/// one-off income/expense entries...` block):

```prisma
/// one-off income/expense entries (manual logs, not from a recurring template) —
/// recurringItemId is set only when this row was created by logging a recurring occurrence
model FinanceTransaction {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id])
  profileId String   @db.Uuid
  type      String // 'income' | 'expense'
  category  String
  label     String
  amount    Float
  date      DateTime @default(now())
  notes     String?
  createdAt DateTime @default(now())
  paymentId String?  @db.Uuid
  payment   Payment? @relation(fields: [paymentId], references: [id])
  recurringItemId String? @db.Uuid
  recurringItem   RecurringItem? @relation(fields: [recurringItemId], references: [id])
  occurrence      RecurringItemOccurrence?

  @@map("finance_transactions")
}
```

- [ ] **Step 3: Add the four new models to `prisma/schema.prisma`**

Insert immediately after the `FinanceTransaction` block from Step 2:

```prisma
/// records that a specific scheduled RecurringItem date was actually logged —
/// the hook that fires BucketAllocationRules and prevents double-logging the same date
model RecurringItemOccurrence {
  id                   String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recurringItem        RecurringItem      @relation(fields: [recurringItemId], references: [id], onDelete: Cascade)
  recurringItemId      String             @db.Uuid
  occurrenceDate       DateTime           @db.Date
  financeTransaction   FinanceTransaction @relation(fields: [financeTransactionId], references: [id])
  financeTransactionId String             @unique @db.Uuid
  createdAt            DateTime           @default(now())

  @@unique([recurringItemId, occurrenceDate])
  @@map("recurring_item_occurrences")
}

/// a named savings goal fund (Travel, Car, New Shoes, ...) — balance and target
/// progress are computed by summing BucketEntry rows, never stored
model SavingsBucket {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile      Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId    String    @db.Uuid
  name         String
  targetAmount Float?
  targetDate   DateTime?
  archivedAt   DateTime?
  createdAt    DateTime  @default(now())

  entries BucketEntry[]
  rules   BucketAllocationRule[]

  @@map("savings_buckets")
}

/// the bucket ledger — contributions and withdrawals; fully independent of
/// FinanceTransaction (a contribution never creates a transaction row)
model BucketEntry {
  id                    String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  bucket                SavingsBucket @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  bucketId              String        @db.Uuid
  type                  String // 'contribution' | 'withdrawal'
  amount                Float // always positive; `type` gives sign
  note                  String?
  source                String // 'manual' | 'auto_rule'
  sourceRecurringItem   RecurringItem? @relation(fields: [sourceRecurringItemId], references: [id])
  sourceRecurringItemId String?       @db.Uuid
  createdAt             DateTime      @default(now())

  @@map("bucket_entries")
}

/// "when this income recurring item's occurrence is logged, auto-contribute to this bucket"
model BucketAllocationRule {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recurringItem   RecurringItem @relation(fields: [recurringItemId], references: [id], onDelete: Cascade)
  recurringItemId String        @db.Uuid
  bucket          SavingsBucket @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  bucketId        String        @db.Uuid
  mode            String // 'fixed_amount' | 'percentage'
  value           Float // dollar amount, or percentage points (e.g. 20 = 20%)
  isActive        Boolean       @default(true)
  createdAt       DateTime      @default(now())

  @@map("bucket_allocation_rules")
}
```

- [ ] **Step 4: Add the `Profile` back-relation**

In `prisma/schema.prisma`, find line 78 (`  FinancialGoal      FinancialGoal[]`) inside the `Profile` model and add directly below it:

```prisma
  SavingsBucket      SavingsBucket[]
```

- [ ] **Step 5: Write the migration SQL**

Create `prisma/migrations/20260910120000_add_savings_buckets/migration.sql`:

```sql
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
```

- [ ] **Step 6: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: `4 migrations found` (or similar) ending in the new migration applied with no errors; `Generated Prisma Client` success message.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260910120000_add_savings_buckets
git commit -m "feat(moneylog): add savings bucket, occurrence, and allocation rule tables"
```

---

## Task 2: Frequency engine — biweekly

**Files:**
- Modify: `lib/financePeriods.ts:48-61` (`RecurringItemRow` interface), `lib/financePeriods.ts:82-124` (`expandRecurringInRange`)
- Modify: `lib/financePeriods.selftest.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `RecurringItemRow` now has `anchorDate: string | null; secondDayOfMonth: number | null`. `expandRecurringInRange` now handles `frequency === 'biweekly'` (every 14 days from `anchorDate`, both directions). Later tasks (RecurringItemForm, useFinanceData, spendable.ts) rely on this handling being present.

- [ ] **Step 1: Add fields to `RecurringItemRow`**

In `lib/financePeriods.ts`, replace lines 48-61:

```typescript
export interface RecurringItemRow {
  id: string;
  type: string;
  category: string;
  label: string;
  amount: number;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  anchorDate: string | null;
  secondDayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}
```

- [ ] **Step 2: Write the failing selftest assertions**

In `lib/financePeriods.selftest.ts`, insert after the "yearly" block (after line 61, before the "inactive items excluded" block):

```typescript
  // expandRecurringInRange — biweekly (every 14 days from anchorDate)
  const biweeklyItem = {
    id: '7', type: 'income', category: 'salary', label: 'Paycheck', amount: 1500,
    frequency: 'biweekly', dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
    anchorDate: new Date(2026, 0, 2).toISOString(), secondDayOfMonth: null, // Jan 2, 2026 (Friday)
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const marchRange = getPeriodRange('monthly', new Date(2026, 2, 1)); // March 2026: 31 days
  const biweeklyOccurrences = expandRecurringInRange([biweeklyItem], marchRange.start, marchRange.end);
  // Jan 2 + 14*k: Jan 2, 16, 30, Feb 13, 27, Mar 13, 27 -> two in March
  assert(biweeklyOccurrences.length === 2, `biweekly item expands to 2 occurrences in March 2026 (got ${biweeklyOccurrences.length})`);
  assert(
    biweeklyOccurrences.every((o) => o.date.getDate() === 13 || o.date.getDate() === 27),
    `biweekly occurrences land on the 13th and 27th (got ${biweeklyOccurrences.map((o) => o.date.getDate())})`
  );

  // expandRecurringInRange — biweekly with no anchorDate produces nothing
  const biweeklyNoAnchor = { ...biweeklyItem, id: '8', anchorDate: null };
  assert(expandRecurringInRange([biweeklyNoAnchor], marchRange.start, marchRange.end).length === 0, 'biweekly item without anchorDate produces no occurrences');
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts`
Expected: `FAIL: biweekly item expands to 2 occurrences in March 2026 (got 0)` (biweekly isn't handled yet, so `expandRecurringInRange` returns nothing for it — no branch matches).

- [ ] **Step 4: Implement the biweekly branch**

In `lib/financePeriods.ts`, in `expandRecurringInRange`, add this branch right after the `yearly` branch (after the closing `}` on line 123, before the final closing `}` of the `for` loop on line 124):

```typescript
    } else if (item.frequency === 'biweekly' && item.anchorDate) {
      const anchor = new Date(item.anchorDate);
      // Round the gap between anchor and range start down to the nearest
      // whole 14-day step so the loop's first candidate lands on or just
      // before `start`, then walks forward — handles anchors both inside
      // and long before the query range.
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysSinceAnchor = Math.floor((start.getTime() - anchor.getTime()) / msPerDay);
      const stepsSinceAnchor = Math.floor(daysSinceAnchor / 14);
      let cursor = new Date(anchor.getTime() + stepsSinceAnchor * 14 * msPerDay);
      while (cursor <= end) {
        if (
          cursor >= start &&
          cursor >= itemStart &&
          (!itemEnd || cursor <= itemEnd)
        ) {
          results.push({ type: item.type, category: item.category, amount: item.amount, date: cursor });
        }
        cursor = new Date(cursor.getTime() + 14 * msPerDay);
      }
    }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts`
Expected: `All financePeriods assertions passed`

- [ ] **Step 6: Commit**

```bash
git add lib/financePeriods.ts lib/financePeriods.selftest.ts
git commit -m "feat(moneylog): support biweekly recurring frequency"
```

---

## Task 3: Frequency engine — semimonthly

**Files:**
- Modify: `lib/financePeriods.ts` (the `expandRecurringInRange` function from Task 2)
- Modify: `lib/financePeriods.selftest.ts`

**Interfaces:**
- Consumes: `RecurringItemRow` from Task 2 (already has `secondDayOfMonth`)
- Produces: `expandRecurringInRange` handles `frequency === 'semimonthly'`, using `dayOfMonth` as the first date and `secondDayOfMonth` as the second (`0` = last day of month).

- [ ] **Step 1: Write the failing selftest assertions**

In `lib/financePeriods.selftest.ts`, insert directly after the biweekly assertions added in Task 2:

```typescript
  // expandRecurringInRange — semimonthly (two fixed calendar dates, second = last day of month)
  const semimonthlyItem = {
    id: '9', type: 'income', category: 'salary', label: 'Salary', amount: 2000,
    frequency: 'semimonthly', dayOfWeek: null, dayOfMonth: 15, monthOfYear: null,
    anchorDate: null, secondDayOfMonth: 0, // 0 = last day of month
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const febSemiRange = getPeriodRange('monthly', new Date(2026, 1, 1)); // Feb 2026 (28 days)
  const febSemiOccurrences = expandRecurringInRange([semimonthlyItem], febSemiRange.start, febSemiRange.end);
  assert(febSemiOccurrences.length === 2, `semimonthly item expands to 2 occurrences in Feb 2026 (got ${febSemiOccurrences.length})`);
  assert(
    febSemiOccurrences.some((o) => o.date.getDate() === 15) && febSemiOccurrences.some((o) => o.date.getDate() === 28),
    `semimonthly occurrences land on the 15th and last day (28th) of Feb (got ${febSemiOccurrences.map((o) => o.date.getDate())})`
  );

  // expandRecurringInRange — semimonthly with a literal (non-last-day) second date
  const semimonthlyLiteral = { ...semimonthlyItem, id: '10', secondDayOfMonth: 30 };
  const aprSemiRange = getPeriodRange('monthly', new Date(2026, 3, 1)); // April 2026 (30 days)
  const aprSemiOccurrences = expandRecurringInRange([semimonthlyLiteral], aprSemiRange.start, aprSemiRange.end);
  assert(
    aprSemiOccurrences.some((o) => o.date.getDate() === 15) && aprSemiOccurrences.some((o) => o.date.getDate() === 30),
    `semimonthly with secondDayOfMonth=30 lands on the 15th and 30th in April (got ${aprSemiOccurrences.map((o) => o.date.getDate())})`
  );
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts`
Expected: `FAIL: semimonthly item expands to 2 occurrences in Feb 2026 (got 0)`

- [ ] **Step 3: Implement the semimonthly branch**

In `lib/financePeriods.ts`, add this branch right after the `biweekly` branch added in Task 2 (immediately before the final closing `}` of the `if/else if` chain, i.e. right after `cursor = new Date(cursor.getTime() + 14 * msPerDay);\n      }\n    }`):

```typescript
    } else if (item.frequency === 'semimonthly' && item.dayOfMonth !== null && item.secondDayOfMonth !== null) {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor <= end) {
        const year = cursor.getFullYear();
        const monthIndex = cursor.getMonth();
        const firstDay = clampDayOfMonth(year, monthIndex, item.dayOfMonth);
        const secondDayRaw = item.secondDayOfMonth === 0 ? 31 : item.secondDayOfMonth; // 0 sentinel -> clamp forces last day
        const secondDay = clampDayOfMonth(year, monthIndex, secondDayRaw);
        for (const day of [firstDay, secondDay]) {
          const occurrence = new Date(year, monthIndex, day);
          if (
            isWithinInterval(occurrence, { start, end }) &&
            occurrence >= itemStart &&
            (!itemEnd || occurrence <= itemEnd)
          ) {
            results.push({ type: item.type, category: item.category, amount: item.amount, date: occurrence });
          }
        }
        cursor = new Date(year, monthIndex + 1, 1);
      }
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts`
Expected: `All financePeriods assertions passed`

- [ ] **Step 5: Commit**

```bash
git add lib/financePeriods.ts lib/financePeriods.selftest.ts
git commit -m "feat(moneylog): support semimonthly recurring frequency"
```

---

## Task 4: Recurring item form — biweekly/semimonthly fields

**Files:**
- Modify: `lib/recurringItemDraft.ts`
- Modify: `components/moneylog/RecurringItemForm.tsx`

**Interfaces:**
- Consumes: nothing new (pure UI + draft type)
- Produces: `RecurringItemDraft` gains `anchorDate: string | null; secondDayOfMonth: number | null`, and `frequency` widens to include `'biweekly' | 'semimonthly'`. Any code constructing a `RecurringItemDraft` (the recurring items API insert call, wherever `onSubmit` is wired up) must pass these two new fields.

- [ ] **Step 1: Widen `RecurringItemDraft`**

Replace `lib/recurringItemDraft.ts`:

```typescript
// lib/recurringItemDraft.ts

export interface RecurringItemDraft {
  type: 'income' | 'expense';
  category: string;
  label: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'semimonthly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  anchorDate: string | null;
  secondDayOfMonth: number | null;
}
```

- [ ] **Step 2: Add frequency state and options in `RecurringItemForm.tsx`**

In `components/moneylog/RecurringItemForm.tsx`, replace line 30 (`const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');`) with:

```typescript
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'semimonthly'>('monthly');
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [secondDayOfMonth, setSecondDayOfMonth] = useState('1');
  const [secondDayIsLastOfMonth, setSecondDayIsLastOfMonth] = useState(true);
```

- [ ] **Step 3: Pass the new fields in `handleSubmit`**

In `components/moneylog/RecurringItemForm.tsx`, replace the `onSubmit({...})` call (lines 55-64):

```typescript
    onSubmit({
      type,
      category,
      label: label.trim(),
      amount: amountNum,
      frequency,
      dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : null,
      dayOfMonth: frequency === 'monthly' || frequency === 'yearly' || frequency === 'semimonthly' ? Number(dayOfMonth) : null,
      monthOfYear: frequency === 'yearly' ? Number(monthOfYear) : null,
      anchorDate: frequency === 'biweekly' ? new Date(anchorDate).toISOString() : null,
      secondDayOfMonth:
        frequency === 'semimonthly' ? (secondDayIsLastOfMonth ? 0 : Number(secondDayOfMonth)) : null,
    });
```

- [ ] **Step 4: Add the two new frequency options to the Select**

In `components/moneylog/RecurringItemForm.tsx`, replace the frequency `SelectContent` (lines 140-144):

```tsx
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Biweekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="semimonthly">Twice a month</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
```

- [ ] **Step 5: Add conditional fields for biweekly and semimonthly**

In `components/moneylog/RecurringItemForm.tsx`, replace the `(frequency === 'monthly' || frequency === 'yearly') &&` block (lines 166-179) to also cover `semimonthly` for the first date, and add new blocks for `biweekly`'s anchor date and `semimonthly`'s second date right after it (before the existing `{frequency === 'yearly' && (...)}` block on line 181):

```tsx
      {(frequency === 'monthly' || frequency === 'yearly' || frequency === 'semimonthly') && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-day-of-month">{frequency === 'semimonthly' ? 'First day of month' : 'Day of month'}</Label>
          <Input
            id="recurring-day-of-month"
            type="number"
            inputMode="numeric"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
      )}

      {frequency === 'semimonthly' && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-second-day">Second date</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={secondDayIsLastOfMonth ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSecondDayIsLastOfMonth(true)}
            >
              Last day of month
            </Button>
            <Button
              type="button"
              variant={!secondDayIsLastOfMonth ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSecondDayIsLastOfMonth(false)}
            >
              Specific day
            </Button>
          </div>
          {!secondDayIsLastOfMonth && (
            <Input
              id="recurring-second-day"
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              value={secondDayOfMonth}
              onChange={(e) => setSecondDayOfMonth(e.target.value)}
            />
          )}
        </div>
      )}

      {frequency === 'biweekly' && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-anchor-date">Anchor date (a date this was/will be paid)</Label>
          <Input
            id="recurring-anchor-date"
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
        </div>
      )}
```

- [ ] **Step 6: Find and update the caller that inserts `RecurringItemDraft` rows**

Run: `grep -rn "onSubmit={" app/\(moneylog\)/moneylog/plan --include=*.tsx`

Read the matching file(s) and update the `.insert(...)` (or equivalent) call to also write `anchorDate: draft.anchorDate, secondDayOfMonth: draft.secondDayOfMonth` alongside the existing `dayOfWeek`/`dayOfMonth`/`monthOfYear` fields, mirroring how those are already passed through.

- [ ] **Step 7: Manually verify**

Run: `npm run dev`, navigate to `/moneylog/plan`, open "Add recurring item", select "Biweekly" — confirm the anchor date picker appears; select "Twice a month" — confirm the day-of-month and second-date controls appear and toggling "Specific day" reveals a number input. Submit one of each and confirm no console errors and the new row appears in the recurring items list.

- [ ] **Step 8: Commit**

```bash
git add lib/recurringItemDraft.ts components/moneylog/RecurringItemForm.tsx app/\(moneylog\)/moneylog/plan
git commit -m "feat(moneylog): add biweekly and semimonthly options to the recurring item form"
```

---

## Task 5: Bucket balance/progress computation

**Files:**
- Create: `lib/moneylog/buckets.ts`
- Create: `lib/moneylog/buckets.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `computeBucketBalance(entries: BucketEntryRow[]): number` and `computeBucketProgress(balance: number, targetAmount: number | null): number | null` (returns a 0-1 fraction, or `null` when there's no target), exported types `BucketEntryRow = { type: 'contribution' | 'withdrawal'; amount: number }`. The bucket API routes (Task 7) and detail UI (Task 11) both import these.

- [ ] **Step 1: Write the failing test**

Create `lib/moneylog/buckets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeBucketBalance, computeBucketProgress } from './buckets';

describe('computeBucketBalance', () => {
  it('sums contributions and subtracts withdrawals', () => {
    const balance = computeBucketBalance([
      { type: 'contribution', amount: 100 },
      { type: 'contribution', amount: 50 },
      { type: 'withdrawal', amount: 30 },
    ]);
    expect(balance).toBe(120);
  });

  it('returns 0 for no entries', () => {
    expect(computeBucketBalance([])).toBe(0);
  });
});

describe('computeBucketProgress', () => {
  it('returns the fraction of target reached', () => {
    expect(computeBucketProgress(50, 200)).toBe(0.25);
  });

  it('clamps at 1 when balance exceeds target', () => {
    expect(computeBucketProgress(300, 200)).toBe(1);
  });

  it('returns null when there is no target', () => {
    expect(computeBucketProgress(50, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/moneylog/buckets.test.ts`
Expected: FAIL — `Cannot find module './buckets'`

- [ ] **Step 3: Implement**

Create `lib/moneylog/buckets.ts`:

```typescript
// lib/moneylog/buckets.ts
//
// Pure computation over a SavingsBucket's BucketEntry ledger. Balance and
// target progress are always derived here, never stored on savings_buckets —
// see the design doc's "Data model" section for why.

export interface BucketEntryRow {
  type: 'contribution' | 'withdrawal';
  amount: number;
}

export function computeBucketBalance(entries: BucketEntryRow[]): number {
  return entries.reduce((sum, entry) => sum + (entry.type === 'contribution' ? entry.amount : -entry.amount), 0);
}

export function computeBucketProgress(balance: number, targetAmount: number | null): number | null {
  if (targetAmount === null || targetAmount <= 0) return null;
  return Math.min(balance / targetAmount, 1);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/moneylog/buckets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/moneylog/buckets.ts lib/moneylog/buckets.test.ts
git commit -m "feat(moneylog): add bucket balance and progress computation"
```

---

## Task 6: Spendable-this-period formula

**Files:**
- Create: `lib/moneylog/spendable.ts`
- Create: `lib/moneylog/spendable.test.ts`

**Interfaces:**
- Consumes: `expandRecurringInRange`, `RecurringItemRow`, `FinanceLineItem` from `lib/financePeriods.ts` (Task 2/3)
- Produces: `computeSpendable(input: SpendableInput): SpendableResult` where
  `SpendableInput = { recurringItems: RecurringItemRow[]; periodStart: Date; periodEnd: Date; loggedExpenses: { amount: number; date: string }[]; bucketContributions: { amount: number; createdAt: string }[] }`
  and `SpendableResult = { projectedIncome: number; projectedBills: number; bucketContributions: number; spendable: number; spentSoFar: number; remaining: number }`. The Home spendable card (Task 12) calls this directly with data it fetches.

- [ ] **Step 1: Write the failing test**

Create `lib/moneylog/spendable.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeSpendable } from './spendable';
import type { RecurringItemRow } from '../financePeriods';

const periodStart = new Date(2026, 2, 2); // Mon Mar 2, 2026
const periodEnd = new Date(2026, 2, 8); // Sun Mar 8, 2026

function recurringItem(overrides: Partial<RecurringItemRow>): RecurringItemRow {
  return {
    id: 'r1', type: 'income', category: 'salary', label: 'Salary', amount: 0,
    frequency: 'weekly', dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
    anchorDate: null, secondDayOfMonth: null,
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
    ...overrides,
  };
}

describe('computeSpendable', () => {
  it('computes spendable as projected income minus bills minus bucket contributions', () => {
    const result = computeSpendable({
      recurringItems: [
        recurringItem({ id: 'income1', type: 'income', category: 'salary', amount: 1000, frequency: 'weekly', dayOfWeek: 3 }), // Wed, in range
        recurringItem({ id: 'bill1', type: 'expense', category: 'rent', amount: 200, frequency: 'weekly', dayOfWeek: 4 }), // Thu, in range
      ],
      periodStart,
      periodEnd,
      loggedExpenses: [{ amount: 50, date: new Date(2026, 2, 3).toISOString() }],
      bucketContributions: [{ amount: 100, createdAt: new Date(2026, 2, 3).toISOString() }],
    });

    expect(result.projectedIncome).toBe(1000);
    expect(result.projectedBills).toBe(200);
    expect(result.bucketContributions).toBe(100);
    expect(result.spendable).toBe(700); // 1000 - 200 - 100
    expect(result.spentSoFar).toBe(50);
    expect(result.remaining).toBe(650); // 700 - 50
  });

  it('excludes bucket contributions and expenses logged outside the period', () => {
    const result = computeSpendable({
      recurringItems: [],
      periodStart,
      periodEnd,
      loggedExpenses: [{ amount: 999, date: new Date(2026, 2, 20).toISOString() }],
      bucketContributions: [{ amount: 999, createdAt: new Date(2026, 2, 20).toISOString() }],
    });
    expect(result.spentSoFar).toBe(0);
    expect(result.bucketContributions).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/moneylog/spendable.test.ts`
Expected: FAIL — `Cannot find module './spendable'`

- [ ] **Step 3: Implement**

Create `lib/moneylog/spendable.ts`:

```typescript
// lib/moneylog/spendable.ts
//
// "How much can I spend this period" = projected recurring income minus
// projected recurring bills minus bucket contributions logged this period,
// against actual expenses logged this period. See the design doc's
// "Spendable-this-period tracker" section.
import { expandRecurringInRange } from '../financePeriods';
import type { RecurringItemRow } from '../financePeriods';

export interface SpendableInput {
  recurringItems: RecurringItemRow[];
  periodStart: Date;
  periodEnd: Date;
  loggedExpenses: { amount: number; date: string }[];
  bucketContributions: { amount: number; createdAt: string }[];
}

export interface SpendableResult {
  projectedIncome: number;
  projectedBills: number;
  bucketContributions: number;
  spendable: number;
  spentSoFar: number;
  remaining: number;
}

function inRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function computeSpendable(input: SpendableInput): SpendableResult {
  const projected = expandRecurringInRange(input.recurringItems, input.periodStart, input.periodEnd);
  const projectedIncome = projected.filter((p) => p.type === 'income').reduce((sum, p) => sum + p.amount, 0);
  const projectedBills = projected.filter((p) => p.type === 'expense').reduce((sum, p) => sum + p.amount, 0);

  const bucketContributions = input.bucketContributions
    .filter((c) => inRange(c.createdAt, input.periodStart, input.periodEnd))
    .reduce((sum, c) => sum + c.amount, 0);

  const spentSoFar = input.loggedExpenses
    .filter((e) => inRange(e.date, input.periodStart, input.periodEnd))
    .reduce((sum, e) => sum + e.amount, 0);

  const spendable = projectedIncome - projectedBills - bucketContributions;

  return {
    projectedIncome,
    projectedBills,
    bucketContributions,
    spendable,
    spentSoFar,
    remaining: spendable - spentSoFar,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/moneylog/spendable.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/moneylog/spendable.ts lib/moneylog/spendable.test.ts
git commit -m "feat(moneylog): add spendable-this-period formula"
```

---

## Task 7: Buckets CRUD API

**Files:**
- Create: `app/api/moneylog/buckets/route.ts`
- Create: `app/api/moneylog/buckets/[id]/route.ts`

**Interfaces:**
- Consumes: `computeBucketBalance`, `computeBucketProgress` from `lib/moneylog/buckets.ts` (Task 5)
- Produces: `GET /api/moneylog/buckets` → `{ buckets: BucketSummary[] }`; `POST /api/moneylog/buckets` → `{ bucket: BucketSummary }`; `GET /api/moneylog/buckets/[id]` → `{ bucket: BucketSummary; entries: BucketEntryDto[] }`; `PATCH /api/moneylog/buckets/[id]` (archive/rename/retarget) → `{ bucket: BucketSummary }`, where `BucketSummary = { id, name, targetAmount, targetDate, balance, progress, createdAt }`. Task 10 (list/detail UI) and Task 8 (entries route) consume these shapes.

- [ ] **Step 1: Implement the list/create route**

Create `app/api/moneylog/buckets/route.ts`:

```typescript
// app/api/moneylog/buckets/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeBucketBalance, computeBucketProgress } from '@/lib/moneylog/buckets';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

type BucketRow = {
  id: string;
  name: string;
  targetAmount: number | null;
  targetDate: string | null;
  createdAt: string;
  entries: { type: string; amount: number }[];
};

function toSummary(row: BucketRow) {
  const balance = computeBucketBalance(row.entries as { type: 'contribution' | 'withdrawal'; amount: number }[]);
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount,
    targetDate: row.targetDate,
    balance,
    progress: computeBucketProgress(balance, row.targetAmount),
    createdAt: row.createdAt,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: rows, error } = await admin
      .from('savings_buckets')
      .select('id, name, targetAmount, targetDate, createdAt, entries:bucket_entries(type, amount)')
      .eq('profileId', meId)
      .is('archivedAt', null)
      .order('createdAt', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const buckets = ((rows ?? []) as unknown as BucketRow[]).map(toSummary);
    return NextResponse.json({ buckets });
  } catch (error) {
    console.error('moneylog buckets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateBucketBody {
  name?: string;
  targetAmount?: number;
  targetDate?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { name, targetAmount, targetDate } = (await request.json()) as CreateBucketBody;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (targetAmount !== undefined && (typeof targetAmount !== 'number' || !Number.isFinite(targetAmount) || targetAmount <= 0)) {
      return NextResponse.json({ error: 'targetAmount must be a positive number' }, { status: 400 });
    }

    const { data: bucket, error } = await admin
      .from('savings_buckets')
      .insert({
        profileId: meId,
        name: name.trim(),
        targetAmount: targetAmount ?? null,
        targetDate: targetDate ?? null,
      })
      .select('id, name, targetAmount, targetDate, createdAt')
      .single();

    if (error || !bucket) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create bucket' }, { status: 400 });
    }

    return NextResponse.json({ bucket: toSummary({ ...bucket, entries: [] }) });
  } catch (error) {
    console.error('moneylog buckets POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement the detail/update route**

Create `app/api/moneylog/buckets/[id]/route.ts`:

```typescript
// app/api/moneylog/buckets/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeBucketBalance, computeBucketProgress } from '@/lib/moneylog/buckets';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket, error } = await admin
      .from('savings_buckets')
      .select('id, name, targetAmount, targetDate, createdAt, profileId, entries:bucket_entries(id, type, amount, note, source, createdAt)')
      .eq('id', id)
      .single();

    if (error || !bucket || bucket.profileId !== meId) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const entries = (bucket.entries as { type: string; amount: number }[]) ?? [];
    const balance = computeBucketBalance(entries as { type: 'contribution' | 'withdrawal'; amount: number }[]);

    return NextResponse.json({
      bucket: {
        id: bucket.id,
        name: bucket.name,
        targetAmount: bucket.targetAmount,
        targetDate: bucket.targetDate,
        balance,
        progress: computeBucketProgress(balance, bucket.targetAmount),
        createdAt: bucket.createdAt,
      },
      entries: bucket.entries,
    });
  } catch (error) {
    console.error('moneylog bucket GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface UpdateBucketBody {
  name?: string;
  targetAmount?: number | null;
  targetDate?: string | null;
  archive?: boolean;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: existing } = await admin.from('savings_buckets').select('profileId').eq('id', id).single();
    if (!existing || existing.profileId !== meId) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const body = (await request.json()) as UpdateBucketBody;
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      update.name = body.name.trim();
    }
    if (body.targetAmount !== undefined) update.targetAmount = body.targetAmount;
    if (body.targetDate !== undefined) update.targetDate = body.targetDate;
    if (body.archive) update.archivedAt = new Date().toISOString();

    const { data: bucket, error } = await admin
      .from('savings_buckets')
      .update(update)
      .eq('id', id)
      .select('id, name, targetAmount, targetDate, createdAt, entries:bucket_entries(type, amount)')
      .single();

    if (error || !bucket) {
      return NextResponse.json({ error: error?.message ?? 'Failed to update bucket' }, { status: 400 });
    }

    const entries = (bucket.entries as { type: 'contribution' | 'withdrawal'; amount: number }[]) ?? [];
    const balance = computeBucketBalance(entries);

    return NextResponse.json({
      bucket: {
        id: bucket.id,
        name: bucket.name,
        targetAmount: bucket.targetAmount,
        targetDate: bucket.targetDate,
        balance,
        progress: computeBucketProgress(balance, bucket.targetAmount),
        createdAt: bucket.createdAt,
      },
    });
  } catch (error) {
    console.error('moneylog bucket PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, then from a browser console on an authenticated page (or via `curl` with a session cookie):
`fetch('/api/moneylog/buckets', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Travel', targetAmount: 2000 }) }).then(r => r.json()).then(console.log)`
Expected: `{ bucket: { id, name: 'Travel', targetAmount: 2000, balance: 0, progress: 0, ... } }`. Then `fetch('/api/moneylog/buckets').then(r => r.json()).then(console.log)` shows it in the list.

- [ ] **Step 4: Commit**

```bash
git add app/api/moneylog/buckets
git commit -m "feat(moneylog): add buckets CRUD API"
```

---

## Task 8: Bucket entries and allocation rules API

**Files:**
- Create: `app/api/moneylog/buckets/[id]/entries/route.ts`
- Create: `app/api/moneylog/buckets/[id]/rules/route.ts`
- Create: `app/api/moneylog/recurring-items/[id]/rules/route.ts`

**Interfaces:**
- Consumes: `computeBucketBalance`, `computeBucketProgress` from Task 5
- Produces: `POST /api/moneylog/buckets/[id]/entries` (manual contribution/withdrawal) → `{ bucket: BucketSummary; entry: BucketEntryDto }`; `GET|POST /api/moneylog/buckets/[id]/rules` → rules for a bucket; `GET /api/moneylog/recurring-items/[id]/rules` → rules for a recurring item (used by Task 9's log-occurrence and Task 11's recurring-item edit UI).

- [ ] **Step 1: Implement the manual entry route**

Create `app/api/moneylog/buckets/[id]/entries/route.ts`:

```typescript
// app/api/moneylog/buckets/[id]/entries/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeBucketBalance, computeBucketProgress } from '@/lib/moneylog/buckets';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface CreateEntryBody {
  type?: 'contribution' | 'withdrawal';
  amount?: number;
  note?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bucketId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket } = await admin.from('savings_buckets').select('profileId').eq('id', bucketId).single();
    if (!bucket || bucket.profileId !== meId) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const { type, amount, note } = (await request.json()) as CreateEntryBody;
    if (type !== 'contribution' && type !== 'withdrawal') {
      return NextResponse.json({ error: "type must be 'contribution' or 'withdrawal'" }, { status: 400 });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const { data: entry, error: entryError } = await admin
      .from('bucket_entries')
      .insert({ bucketId, type, amount, note: note?.trim() || null, source: 'manual' })
      .select('id, type, amount, note, source, createdAt')
      .single();
    if (entryError || !entry) {
      return NextResponse.json({ error: entryError?.message ?? 'Failed to record entry' }, { status: 400 });
    }

    const { data: allEntries } = await admin.from('bucket_entries').select('type, amount').eq('bucketId', bucketId);
    const { data: bucketRow } = await admin.from('savings_buckets').select('id, name, targetAmount, targetDate, createdAt').eq('id', bucketId).single();

    const balance = computeBucketBalance((allEntries ?? []) as { type: 'contribution' | 'withdrawal'; amount: number }[]);

    return NextResponse.json({
      entry,
      bucket: bucketRow
        ? {
            ...bucketRow,
            balance,
            progress: computeBucketProgress(balance, bucketRow.targetAmount),
          }
        : null,
    });
  } catch (error) {
    console.error('moneylog bucket entry POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement the bucket-scoped rules route**

Create `app/api/moneylog/buckets/[id]/rules/route.ts`:

```typescript
// app/api/moneylog/buckets/[id]/rules/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bucketId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket } = await admin.from('savings_buckets').select('profileId').eq('id', bucketId).single();
    if (!bucket || bucket.profileId !== meId) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

    const { data: rules, error } = await admin
      .from('bucket_allocation_rules')
      .select('id, recurringItemId, bucketId, mode, value, isActive, createdAt, recurringItem:recurring_items(label)')
      .eq('bucketId', bucketId)
      .order('createdAt', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ rules: rules ?? [] });
  } catch (error) {
    console.error('moneylog bucket rules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateRuleBody {
  recurringItemId?: string;
  mode?: 'fixed_amount' | 'percentage';
  value?: number;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bucketId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket } = await admin.from('savings_buckets').select('profileId').eq('id', bucketId).single();
    if (!bucket || bucket.profileId !== meId) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

    const { recurringItemId, mode, value } = (await request.json()) as CreateRuleBody;
    if (!recurringItemId) return NextResponse.json({ error: 'recurringItemId is required' }, { status: 400 });
    if (mode !== 'fixed_amount' && mode !== 'percentage') {
      return NextResponse.json({ error: "mode must be 'fixed_amount' or 'percentage'" }, { status: 400 });
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'value must be a positive number' }, { status: 400 });
    }

    const { data: recurringItem } = await admin
      .from('recurring_items')
      .select('id, profileId, type')
      .eq('id', recurringItemId)
      .single();
    if (!recurringItem || recurringItem.profileId !== meId) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }
    if (recurringItem.type !== 'income') {
      return NextResponse.json({ error: 'Allocation rules can only be attached to income recurring items' }, { status: 400 });
    }

    const { data: rule, error } = await admin
      .from('bucket_allocation_rules')
      .insert({ recurringItemId, bucketId, mode, value })
      .select('id, recurringItemId, bucketId, mode, value, isActive, createdAt')
      .single();
    if (error || !rule) return NextResponse.json({ error: error?.message ?? 'Failed to create rule' }, { status: 400 });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('moneylog bucket rules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Implement the recurring-item-scoped rules listing route**

Create `app/api/moneylog/recurring-items/[id]/rules/route.ts`:

```typescript
// app/api/moneylog/recurring-items/[id]/rules/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: recurringItemId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: recurringItem } = await admin.from('recurring_items').select('profileId').eq('id', recurringItemId).single();
    if (!recurringItem || recurringItem.profileId !== meId) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }

    const { data: rules, error } = await admin
      .from('bucket_allocation_rules')
      .select('id, recurringItemId, bucketId, mode, value, isActive, createdAt, bucket:savings_buckets(name)')
      .eq('recurringItemId', recurringItemId)
      .order('createdAt', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ rules: rules ?? [] });
  } catch (error) {
    console.error('moneylog recurring-item rules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Manually verify**

With a bucket already created (Task 7's verification) and an existing income recurring item's id (`id1`), run:
`fetch('/api/moneylog/buckets/<bucketId>/rules', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ recurringItemId: '<id1>', mode: 'percentage', value: 20 }) }).then(r => r.json()).then(console.log)`
Expected: `{ rule: { id, recurringItemId, bucketId, mode: 'percentage', value: 20, isActive: true, ... } }`. Then `fetch('/api/moneylog/buckets/<bucketId>/entries', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'contribution', amount: 50 }) }).then(r => r.json()).then(console.log)` returns `bucket.balance: 50`.

- [ ] **Step 5: Commit**

```bash
git add app/api/moneylog/buckets/\[id\]/entries app/api/moneylog/buckets/\[id\]/rules app/api/moneylog/recurring-items
git commit -m "feat(moneylog): add bucket entries and allocation rules API"
```

---

## Task 9: Occurrence logging API

**Files:**
- Create: `app/api/moneylog/recurring-items/[id]/log-occurrence/route.ts`

**Interfaces:**
- Consumes: nothing new (raw Supabase writes)
- Produces: `POST /api/moneylog/recurring-items/[id]/log-occurrence` body `{ occurrenceDate: string; notes?: string }` → `{ transaction: {...}; occurrence: {...}; bucketEntries: [...] }`. Task 13 (Home unlogged-occurrence prompts) calls this.

- [ ] **Step 1: Implement the route**

Create `app/api/moneylog/recurring-items/[id]/log-occurrence/route.ts`:

```typescript
// app/api/moneylog/recurring-items/[id]/log-occurrence/route.ts
//
// Atomically: creates the FinanceTransaction for a scheduled recurring date,
// records the RecurringItemOccurrence (so the date can't be logged twice —
// enforced by the DB's unique (recurringItemId, occurrenceDate) index), and,
// for income items, fires any active BucketAllocationRules. Sequential
// service-role writes (no Postgres transaction wrapper available here),
// matching the existing assets POST route's asset+balance-entry pattern.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface LogOccurrenceBody {
  occurrenceDate?: string;
  notes?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: recurringItemId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: recurringItem, error: itemError } = await admin
      .from('recurring_items')
      .select('id, profileId, type, category, label, amount')
      .eq('id', recurringItemId)
      .single();
    if (itemError || !recurringItem || recurringItem.profileId !== meId) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }

    const { occurrenceDate, notes } = (await request.json()) as LogOccurrenceBody;
    if (!occurrenceDate) return NextResponse.json({ error: 'occurrenceDate is required' }, { status: 400 });

    const { data: transaction, error: transactionError } = await admin
      .from('finance_transactions')
      .insert({
        profileId: meId,
        type: recurringItem.type,
        category: recurringItem.category,
        label: recurringItem.label,
        amount: recurringItem.amount,
        date: occurrenceDate,
        notes: notes?.trim() || null,
        recurringItemId,
      })
      .select('id, type, category, label, amount, date')
      .single();
    if (transactionError || !transaction) {
      return NextResponse.json({ error: transactionError?.message ?? 'Failed to log transaction' }, { status: 400 });
    }

    const { data: occurrence, error: occurrenceError } = await admin
      .from('recurring_item_occurrences')
      .insert({ recurringItemId, occurrenceDate, financeTransactionId: transaction.id })
      .select('id, recurringItemId, occurrenceDate, financeTransactionId')
      .single();
    if (occurrenceError || !occurrence) {
      // Most likely the unique (recurringItemId, occurrenceDate) constraint —
      // this date was already logged.
      return NextResponse.json({ error: occurrenceError?.message ?? 'This date has already been logged' }, { status: 400 });
    }

    const bucketEntries: unknown[] = [];
    if (recurringItem.type === 'income') {
      const { data: rules } = await admin
        .from('bucket_allocation_rules')
        .select('id, bucketId, mode, value')
        .eq('recurringItemId', recurringItemId)
        .eq('isActive', true);

      for (const rule of rules ?? []) {
        const amount = rule.mode === 'percentage' ? (rule.value / 100) * recurringItem.amount : rule.value;
        const { data: entry } = await admin
          .from('bucket_entries')
          .insert({
            bucketId: rule.bucketId,
            type: 'contribution',
            amount,
            source: 'auto_rule',
            sourceRecurringItemId: recurringItemId,
          })
          .select('id, bucketId, type, amount, source, createdAt')
          .single();
        if (entry) bucketEntries.push(entry);
      }
    }

    return NextResponse.json({ transaction, occurrence, bucketEntries });
  } catch (error) {
    console.error('moneylog log-occurrence POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manually verify**

With a real income recurring item id (`id1`, amount 1000) that has the 20% rule from Task 8 attached:
`fetch('/api/moneylog/recurring-items/<id1>/log-occurrence', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ occurrenceDate: '2026-09-15' }) }).then(r => r.json()).then(console.log)`
Expected: `{ transaction: { amount: 1000, ... }, occurrence: {...}, bucketEntries: [{ amount: 200, source: 'auto_rule', ... }] }`. Repeating the exact same call should now return a 400 error (date already logged).

- [ ] **Step 3: Commit**

```bash
git add app/api/moneylog/recurring-items/\[id\]/log-occurrence
git commit -m "feat(moneylog): add recurring occurrence logging with bucket auto-allocation"
```

---

## Task 10: Buckets list UI

**Files:**
- Modify: `lib/moneylog/queries.ts`
- Create: `app/(moneylog)/moneylog/buckets/page.tsx`
- Create: `app/(moneylog)/moneylog/buckets/_components/BucketListItem.tsx`
- Create: `app/(moneylog)/moneylog/buckets/_components/AddBucketDrawer.tsx`

**Interfaces:**
- Consumes: `GET /api/moneylog/buckets`, `POST /api/moneylog/buckets` from Task 7
- Produces: `bucketsQuery()` (SWR key/fetcher pair, same shape as `assetsQuery()`), exported `BucketSummary` type. Task 11 (detail page) and Task 12 (Home) both import `BucketSummary` and reuse `bucketsQuery`.

- [ ] **Step 1: Add the buckets query to `lib/moneylog/queries.ts`**

Append to `lib/moneylog/queries.ts`:

```typescript
export type BucketSummary = {
  id: string;
  name: string;
  targetAmount: number | null;
  targetDate: string | null;
  balance: number;
  progress: number | null;
  createdAt: string;
};

export async function fetchBuckets(): Promise<{ buckets: BucketSummary[] }> {
  const res = await apiFetch('/api/moneylog/buckets');
  if (!res.ok) throw new Error('Failed to load buckets');
  return res.json();
}

export function bucketsQuery() {
  return {
    key: '/api/moneylog/buckets',
    fetcher: fetchBuckets,
  };
}
```

- [ ] **Step 2: Create `BucketListItem.tsx`**

Create `app/(moneylog)/moneylog/buckets/_components/BucketListItem.tsx`:

```tsx
// app/(moneylog)/moneylog/buckets/_components/BucketListItem.tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BucketSummary } from '@/lib/moneylog/queries';

export function BucketListItem({ bucket }: { bucket: BucketSummary }) {
  return (
    <Link href={`/moneylog/buckets/${bucket.id}`}>
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{bucket.name}</span>
            <span className="text-lg font-semibold">${bucket.balance.toFixed(2)}</span>
          </div>
          {bucket.targetAmount !== null && (
            <>
              <Progress value={(bucket.progress ?? 0) * 100} />
              <p className="text-xs text-muted-foreground">
                {Math.round((bucket.progress ?? 0) * 100)}% of ${bucket.targetAmount.toFixed(2)}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

Run: `grep -n "Progress" /Users/sreehariprathap/Documents/Cowork/Projects/burnlog/components/ui/progress.tsx` first to confirm the component exists and its export name; if it doesn't exist, run `npx shadcn@latest add progress` to add it before using it here.

- [ ] **Step 3: Create `AddBucketDrawer.tsx`**

Create `app/(moneylog)/moneylog/buckets/_components/AddBucketDrawer.tsx`:

```tsx
// app/(moneylog)/moneylog/buckets/_components/AddBucketDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

interface AddBucketDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddBucketDrawer({ open, onOpenChange, onCreated }: AddBucketDrawerProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setTargetAmount('');
    setTargetDate('');
    setNameError(null);
  };

  const submit = async () => {
    setNameError(null);
    if (!name.trim()) {
      setNameError('Enter a name');
      toast({ variant: 'destructive', title: 'Fix the highlighted fields' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch('/api/moneylog/buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        targetAmount: targetAmount ? Number(targetAmount) : undefined,
        targetDate: targetDate || undefined,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: 'Bucket added' });
      reset();
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Bucket</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket-name">Name</Label>
            <Input id="bucket-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Travel Fund" />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket-target-amount">Target amount (optional)</Label>
            <Input
              id="bucket-target-amount"
              type="number"
              min="0"
              step="0.01"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="2000.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket-target-date">Target date (optional)</Label>
            <Input id="bucket-target-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Adding…' : 'Add Bucket'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Create the buckets list page**

Create `app/(moneylog)/moneylog/buckets/page.tsx`:

```tsx
// app/(moneylog)/moneylog/buckets/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Button } from '@/components/ui/button';
import { bucketsQuery } from '@/lib/moneylog/queries';
import { BucketListItem } from './_components/BucketListItem';
import { AddBucketDrawer } from './_components/AddBucketDrawer';

export default function BucketsPage() {
  const { data, isLoading, mutate } = useSWR(bucketsQuery().key, bucketsQuery().fetcher);
  const [addOpen, setAddOpen] = useState(false);

  const buckets = data?.buckets ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Savings Buckets" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (
          <>
            <div className="space-y-2">
              {buckets.map((bucket) => (
                <BucketListItem key={bucket.id} bucket={bucket} />
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Bucket
            </Button>
          </>
        )}
      </main>
      <AddBucketDrawer open={addOpen} onOpenChange={setAddOpen} onCreated={() => mutate()} />
      <MoneyLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, navigate to `/moneylog/buckets`. Confirm the empty state renders with no errors, click "Add Bucket", fill in a name and target amount, submit, and confirm the new bucket card appears with a 0% progress bar.

- [ ] **Step 6: Commit**

```bash
git add lib/moneylog/queries.ts app/\(moneylog\)/moneylog/buckets
git commit -m "feat(moneylog): add savings buckets list page"
```

---

## Task 11: Bucket detail UI

**Files:**
- Create: `app/(moneylog)/moneylog/buckets/[id]/page.tsx`
- Create: `app/(moneylog)/moneylog/buckets/[id]/_components/AddEntryDrawer.tsx`
- Create: `app/(moneylog)/moneylog/buckets/[id]/_components/EntryListItem.tsx`

**Interfaces:**
- Consumes: `GET /api/moneylog/buckets/[id]`, `POST /api/moneylog/buckets/[id]/entries` from Tasks 7-8; `BucketSummary` type from Task 10
- Produces: nothing consumed by later tasks — this is a leaf UI screen.

- [ ] **Step 1: Create `EntryListItem.tsx`**

Create `app/(moneylog)/moneylog/buckets/[id]/_components/EntryListItem.tsx`:

```tsx
// app/(moneylog)/moneylog/buckets/[id]/_components/EntryListItem.tsx
type Entry = { id: string; type: string; amount: number; note: string | null; source: string; createdAt: string };

export function EntryListItem({ entry }: { entry: Entry }) {
  const isContribution = entry.type === 'contribution';
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <div>
        <p className="text-sm">{entry.note || (isContribution ? 'Contribution' : 'Withdrawal')}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(entry.createdAt).toLocaleDateString()} · {entry.source === 'auto_rule' ? 'Auto rule' : 'Manual'}
        </p>
      </div>
      <span className={isContribution ? 'text-green-600' : 'text-destructive'}>
        {isContribution ? '+' : '-'}${entry.amount.toFixed(2)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create `AddEntryDrawer.tsx`**

Create `app/(moneylog)/moneylog/buckets/[id]/_components/AddEntryDrawer.tsx`:

```tsx
// app/(moneylog)/moneylog/buckets/[id]/_components/AddEntryDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

interface AddEntryDrawerProps {
  bucketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddEntryDrawer({ bucketId, open, onOpenChange, onSaved }: AddEntryDrawerProps) {
  const { toast } = useToast();
  const [type, setType] = useState<'contribution' | 'withdrawal'>('contribution');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const reset = () => {
    setAmount('');
    setNote('');
    setAmountError(null);
  };

  const submit = async () => {
    setAmountError(null);
    const amountNum = Number(amount);
    if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) {
      setAmountError('Enter a valid amount');
      toast({ variant: 'destructive', title: 'Fix the highlighted fields' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(`/api/moneylog/buckets/${bucketId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount: amountNum, note: note || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: type === 'contribution' ? 'Added to bucket' : 'Withdrawn from bucket' });
      reset();
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add or Withdraw</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={type === 'contribution' ? 'default' : 'outline'} onClick={() => setType('contribution')}>
              Add money
            </Button>
            <Button type="button" variant={type === 'withdrawal' ? 'default' : 'outline'} onClick={() => setType('withdrawal')}>
              Withdraw
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-amount">Amount</Label>
            <Input id="entry-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {amountError && <p className="text-sm text-destructive">{amountError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-note">Note (optional)</Label>
            <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Flight booking" />
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 3: Create the bucket detail page**

Create `app/(moneylog)/moneylog/buckets/[id]/page.tsx`:

```tsx
// app/(moneylog)/moneylog/buckets/[id]/page.tsx
'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { AddEntryDrawer } from './_components/AddEntryDrawer';
import { EntryListItem } from './_components/EntryListItem';

type BucketDetail = {
  bucket: { id: string; name: string; targetAmount: number | null; balance: number; progress: number | null };
  entries: { id: string; type: string; amount: number; note: string | null; source: string; createdAt: string }[];
};

export default function BucketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, mutate } = useSWR<BucketDetail>(`/api/moneylog/buckets/${id}`, async (url: string) => {
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Failed to load bucket');
    return res.json();
  });
  const [entryOpen, setEntryOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={data?.bucket.name ?? 'Bucket'} />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {data && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-2">
                <p className="text-2xl font-semibold">${data.bucket.balance.toFixed(2)}</p>
                {data.bucket.targetAmount !== null && (
                  <>
                    <Progress value={(data.bucket.progress ?? 0) * 100} />
                    <p className="text-xs text-muted-foreground">
                      {Math.round((data.bucket.progress ?? 0) * 100)}% of ${data.bucket.targetAmount.toFixed(2)}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Button variant="outline" className="w-full" onClick={() => setEntryOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add or Withdraw
            </Button>
            <div className="space-y-1">
              {data.entries
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((entry) => (
                  <EntryListItem key={entry.id} entry={entry} />
                ))}
            </div>
          </>
        )}
      </main>
      <AddEntryDrawer bucketId={id} open={entryOpen} onOpenChange={setEntryOpen} onSaved={() => mutate()} />
    </div>
  );
}
```

- [ ] **Step 4: Manually verify**

Navigate to `/moneylog/buckets`, click a bucket card, confirm the detail page shows balance and (if a target was set) the progress bar. Click "Add or Withdraw", add $25, confirm the balance updates and a new entry row appears in the list. Withdraw $10, confirm the balance drops and the entry shows with a `-` sign.

- [ ] **Step 5: Commit**

```bash
git add app/\(moneylog\)/moneylog/buckets/\[id\]
git commit -m "feat(moneylog): add savings bucket detail page"
```

---

## Task 12: Recurring item edit — manage allocation rules

**Files:**
- Modify: `app/(moneylog)/moneylog/plan/_components/RecurringItemsList.tsx:69-94`
- Create: `app/(moneylog)/moneylog/plan/_components/BucketRulesSection.tsx`

**Interfaces:**
- Consumes: `GET /api/moneylog/recurring-items/[id]/rules`, `POST /api/moneylog/buckets/[id]/rules`, `bucketsQuery` from Task 10
- Produces: nothing consumed by later tasks — leaf UI addition.

- [ ] **Step 1: Create `BucketRulesSection.tsx`**

Create `app/(moneylog)/moneylog/plan/_components/BucketRulesSection.tsx`:

```tsx
// app/(moneylog)/moneylog/plan/_components/BucketRulesSection.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { bucketsQuery } from '@/lib/moneylog/queries';

type Rule = { id: string; mode: string; value: number; bucket: { name: string } | null };

export function BucketRulesSection({ recurringItemId, recurringItemType }: { recurringItemId: string; recurringItemType: string }) {
  const { data, mutate } = useSWR<{ rules: Rule[] }>(
    `/api/moneylog/recurring-items/${recurringItemId}/rules`,
    async (url: string) => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Failed to load rules');
      return res.json();
    }
  );
  const { data: bucketsData } = useSWR(bucketsQuery().key, bucketsQuery().fetcher);
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [bucketId, setBucketId] = useState('');
  const [mode, setMode] = useState<'fixed_amount' | 'percentage'>('percentage');
  const [value, setValue] = useState('');

  if (recurringItemType !== 'income') return null;

  const buckets = bucketsData?.buckets ?? [];

  const submit = async () => {
    if (!bucketId || !value || Number(value) <= 0) {
      toast({ variant: 'destructive', title: 'Choose a bucket and enter a valid value' });
      return;
    }
    const res = await apiFetch(`/api/moneylog/buckets/${bucketId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurringItemId, mode, value: Number(value) }),
    });
    if (res.ok) {
      toast({ title: 'Rule added' });
      setAdding(false);
      setValue('');
      mutate();
    }
  };

  return (
    <div className="space-y-2 border-t pt-3 mt-3">
      <p className="text-sm font-medium">Auto-add to buckets</p>
      {(data?.rules ?? []).map((rule) => (
        <p key={rule.id} className="text-sm text-muted-foreground">
          {rule.mode === 'percentage' ? `${rule.value}%` : `$${rule.value.toFixed(2)}`} → {rule.bucket?.name ?? 'Unknown bucket'}
        </p>
      ))}
      {!adding && (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-2 size-3" />
          Add rule
        </Button>
      )}
      {adding && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="rule-bucket">Bucket</Label>
            <Select value={bucketId} onValueChange={setBucketId}>
              <SelectTrigger id="rule-bucket">
                <SelectValue placeholder="Choose a bucket" />
              </SelectTrigger>
              <SelectContent>
                {buckets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={mode === 'percentage' ? 'default' : 'outline'} size="sm" onClick={() => setMode('percentage')}>%</Button>
            <Button type="button" variant={mode === 'fixed_amount' ? 'default' : 'outline'} size="sm" onClick={() => setMode('fixed_amount')}>$</Button>
          </div>
          <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'percentage' ? '20' : '50.00'} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={submit}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount `BucketRulesSection` in `RecurringItemsList.tsx`**

In `app/(moneylog)/moneylog/plan/_components/RecurringItemsList.tsx`, add the import after line 9 (`import { formatCurrency } from '@/lib/format';`):

```typescript
import { BucketRulesSection } from './BucketRulesSection';
```

Then replace the per-item row (lines 69-94):

```tsx
            <div key={item.id} className="border-b pb-2 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(item.category)} · {frequencyLabel(item)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(item.amount)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(item)}
                    disabled={deletingId === item.id}
                    aria-label={`Delete ${item.label}`}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <BucketRulesSection recurringItemId={item.id} recurringItemType={item.type} />
            </div>
```

- [ ] **Step 3: Manually verify**

Navigate to `/moneylog/plan`, confirm income recurring items now show "Auto-add to buckets" beneath them (and expense items don't), add a rule (e.g. 15% → a bucket created in Task 10), confirm it lists after saving.

- [ ] **Step 4: Commit**

```bash
git add app/\(moneylog\)/moneylog/plan
git commit -m "feat(moneylog): manage bucket allocation rules from the recurring item editor"
```

---

## Task 13: Home — spendable tracker and occurrence prompts

**Files:**
- Create: `app/(moneylog)/moneylog/_components/SpendableCard.tsx`
- Create: `app/(moneylog)/moneylog/_components/UnloggedOccurrencePrompts.tsx`
- Modify: `app/(moneylog)/moneylog/_components/HomeContent.tsx`

**Interfaces:**
- Consumes: `computeSpendable` from Task 6, `expandRecurringInRange`/`getPeriodRange`-equivalent via `lib/moneylog/period.ts`'s `getWeekRange`/`getPeriodConfig` (config-aware), `POST /api/moneylog/recurring-items/[id]/log-occurrence` from Task 9
- Produces: nothing consumed elsewhere — final leaf task wiring everything into Home.

- [ ] **Step 1: Create `SpendableCard.tsx`**

Create `app/(moneylog)/moneylog/_components/SpendableCard.tsx`:

```tsx
// app/(moneylog)/moneylog/_components/SpendableCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getPeriodConfig, getWeekRange } from '@/lib/moneylog/period';
import { computeSpendable } from '@/lib/moneylog/spendable';
import type { RecurringItemRow } from '@/lib/financePeriods';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function SpendableCard({ profileId, refreshKey }: { profileId: string; refreshKey: number }) {
  const supabase = createClient();
  const [biweekly, setBiweekly] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof computeSpendable> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: profile } = await supabase.from('profiles').select('moneylogWeekStart, moneylogMonthStartDay, moneylogYearStartMonth').eq('id', profileId).single();
      const config = getPeriodConfig(profile);
      const { start: weekStart, end: weekEnd } = getWeekRange(new Date(), config);

      // Biweekly pairs the current week with the previous week when the
      // week number since the Unix epoch is odd, keeping period boundaries
      // deterministic without any new per-profile config.
      const epochWeeks = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));
      const periodStart = biweekly && epochWeeks % 2 === 1 ? addDays(weekStart, -7) : weekStart;
      const periodEnd = biweekly ? addDays(periodStart, 13) : weekEnd;

      const [{ data: recurringItems }, { data: transactions }, { data: bucketEntries }] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('finance_transactions').select('amount, date, type').eq('profileId', profileId).gte('date', periodStart.toISOString()).lte('date', periodEnd.toISOString()),
        supabase.from('bucket_entries').select('amount, createdAt, type, bucket:savings_buckets!inner(profileId)').eq('bucket.profileId', profileId).eq('type', 'contribution').gte('createdAt', periodStart.toISOString()).lte('createdAt', periodEnd.toISOString()),
      ]);

      setResult(
        computeSpendable({
          recurringItems: (recurringItems ?? []) as RecurringItemRow[],
          periodStart,
          periodEnd,
          loggedExpenses: (transactions ?? []).filter((t) => t.type === 'expense').map((t) => ({ amount: t.amount, date: t.date })),
          bucketContributions: (bucketEntries ?? []).map((e) => ({ amount: e.amount, createdAt: e.createdAt })),
        })
      );
    })();
  }, [supabase, profileId, biweekly, refreshKey]);

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Left to spend {biweekly ? 'this biweek' : 'this week'}</p>
          <Button variant="ghost" size="sm" onClick={() => setBiweekly((b) => !b)}>
            {biweekly ? 'Switch to weekly' : 'Switch to biweekly'}
          </Button>
        </div>
        {result && (
          <>
            <p className="text-2xl font-semibold">${result.remaining.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              ${result.spentSoFar.toFixed(2)} spent of ${result.spendable.toFixed(2)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `UnloggedOccurrencePrompts.tsx`**

Create `app/(moneylog)/moneylog/_components/UnloggedOccurrencePrompts.tsx`:

```tsx
// app/(moneylog)/moneylog/_components/UnloggedOccurrencePrompts.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow } from '@/lib/financePeriods';

type Prompt = { recurringItemId: string; label: string; amount: number; type: string; date: string };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function UnloggedOccurrencePrompts({ profileId, onLogged }: { profileId: string; onLogged: () => void }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [logging, setLogging] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const windowStart = new Date(today);
      windowStart.setDate(windowStart.getDate() - 7);

      const [{ data: recurringItems }, { data: occurrences }] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('recurring_item_occurrences').select('recurringItemId, occurrenceDate').gte('occurrenceDate', windowStart.toISOString()),
      ]);

      const loggedKeys = new Set((occurrences ?? []).map((o) => `${o.recurringItemId}:${ymd(new Date(o.occurrenceDate))}`));
      const expanded = expandRecurringInRange((recurringItems ?? []) as RecurringItemRow[], windowStart, today);

      const items = (recurringItems ?? []) as RecurringItemRow[];
      const next: Prompt[] = [];
      for (const occurrence of expanded) {
        const item = items.find((i) => i.category === occurrence.category && i.type === occurrence.type && i.amount === occurrence.amount);
        if (!item) continue;
        const key = `${item.id}:${ymd(occurrence.date)}`;
        if (loggedKeys.has(key)) continue;
        next.push({ recurringItemId: item.id, label: item.label, amount: occurrence.amount, type: occurrence.type, date: ymd(occurrence.date) });
      }
      setPrompts(next);
    })();
  }, [supabase, profileId, onLogged]);

  const logOne = async (prompt: Prompt) => {
    setLogging(`${prompt.recurringItemId}:${prompt.date}`);
    const res = await apiFetch(`/api/moneylog/recurring-items/${prompt.recurringItemId}/log-occurrence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurrenceDate: prompt.date }),
    });
    setLogging(null);
    if (res.ok) {
      toast({ title: `${prompt.label} logged` });
      onLogged();
    }
  };

  if (prompts.length === 0) return null;

  return (
    <div className="space-y-2">
      {prompts.map((prompt) => (
        <Card key={`${prompt.recurringItemId}:${prompt.date}`}>
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {prompt.type === 'income' ? 'Log payday' : 'Log bill'} — {prompt.label}
              </p>
              <p className="text-xs text-muted-foreground">${prompt.amount.toFixed(2)} due {prompt.date}</p>
            </div>
            <Button size="sm" onClick={() => logOne(prompt)} disabled={logging === `${prompt.recurringItemId}:${prompt.date}`}>
              Log
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

Note: matching an expanded occurrence back to its source `RecurringItem` by `(category, type, amount)` is a best-effort join since `expandRecurringInRange` doesn't carry the source id through `FinanceLineItem`. This is acceptable for v1 (duplicate category+type+amount recurring items are rare) but is a known limitation — if it causes mismatches in practice, `FinanceLineItem` should gain a `recurringItemId` field as a follow-up.

- [ ] **Step 3: Wire both into `HomeContent.tsx`**

In `app/(moneylog)/moneylog/_components/HomeContent.tsx`, add imports after line 24 (`import { MoneyLogFab } from './MoneyLogFab';`):

```typescript
import { SpendableCard } from './SpendableCard';
import { UnloggedOccurrencePrompts } from './UnloggedOccurrencePrompts';
```

Then, inside the `HomeContent` function's returned JSX, insert both components right after the `TopBar` and before the `SmoothTabs` sticky div (i.e. immediately after the closing `/>` of `TopBar` around line 165):

```tsx
      {profileId && (
        <div className="px-4 pt-2 space-y-2">
          <UnloggedOccurrencePrompts profileId={profileId} onLogged={() => setRefreshKey((k) => k + 1)} />
          <SpendableCard profileId={profileId} refreshKey={refreshKey} />
        </div>
      )}
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, navigate to `/moneylog`. With a weekly income recurring item due today that hasn't been logged, confirm a "Log payday" prompt card appears; click "Log", confirm it disappears and the spendable card's numbers update. Toggle "Switch to biweekly" and confirm the label and numbers change without errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(moneylog\)/moneylog/_components/SpendableCard.tsx app/\(moneylog\)/moneylog/_components/UnloggedOccurrencePrompts.tsx app/\(moneylog\)/moneylog/_components/HomeContent.tsx
git commit -m "feat(moneylog): add spendable tracker and payday/bill prompts to Home"
```

---

## Task 14: Entry point — link to Buckets from Goals

**Files:**
- Modify: `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx:1,17,96-114`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing — final task.

- [ ] **Step 1: Add the import**

In `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx`, replace line 17 (`import { Target, Pencil } from 'lucide-react';`):

```typescript
import Link from 'next/link';
import { Target, Pencil, PiggyBank } from 'lucide-react';
```

- [ ] **Step 2: Add the link card to both the empty state and the populated list**

Replace the empty-state block (lines 96-108):

```tsx
  const bucketsLink = (
    <Link href="/moneylog/buckets">
      <Card>
        <CardContent className="pt-4 flex items-center gap-3">
          <PiggyBank className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Savings Buckets</p>
            <p className="text-xs text-muted-foreground">Travel fund, car fund, and other named goals</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );

  if (goals.length === 0) {
    return (
      <div className="space-y-4">
        {bucketsLink}
        <Card>
          <CardHeader>
            <CardTitle>No financial goals yet</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-2">
            <Target className="w-10 h-10 mx-auto text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Add your first goal below to start tracking progress.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
```

Then replace line 114 (`      {goals.map((goal) => {`) to insert `{bucketsLink}` right before the `.map`:

```tsx
      {bucketsLink}
      {goals.map((goal) => {
```

- [ ] **Step 3: Manually verify**

Navigate to `/moneylog?tab=goals`, confirm the "Savings Buckets" card appears above the goals list (and above the empty state, if there are no goals yet) and clicking it navigates to `/moneylog/buckets`.

- [ ] **Step 4: Commit**

```bash
git add app/\(moneylog\)/moneylog/goals/_components/FinancialGoalsList.tsx
git commit -m "feat(moneylog): link to savings buckets from the Goals tab"
```

---

## Post-implementation checklist

- [ ] `npx vitest run lib/moneylog/buckets.test.ts lib/moneylog/spendable.test.ts` passes
- [ ] `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts` passes
- [ ] `npm run build` succeeds with no type errors
- [ ] Full manual walkthrough: create a bucket with a target → attach a 20% auto-rule to an income recurring item → log that item's occurrence via the Home prompt → confirm the bucket balance increased automatically → manually withdraw from the bucket → confirm the spendable card reflects the contribution but not the withdrawal
