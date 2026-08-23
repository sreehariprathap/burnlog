# LifeLog Core Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, linearly (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LifeLog's four-tab product (Home / Plan / Goals / Insights) on top of the existing app shell: composition rings for income/expense by category across Weekly/Monthly/Yearly periods, recurring income/expense management with a guided onboarding wizard, financial goals with auto-derived progress, and an insights view.

**Architecture:** Three new Prisma models (`RecurringItem`, `FinanceTransaction`, `FinancialGoal`), all keyed by `profileId` exactly like every existing BurnLog table. Recurring items are templates only — period totals are computed at read time by expanding them into virtual occurrences (`lib/financePeriods.ts`) and merging with real `FinanceTransaction` rows; nothing is ever materialized into extra DB rows. UI reuses BurnLog's existing shared components as-is (`SmoothTabs`, `MotionCarousel`, `Card`/`Select`/`Input`/`Button`/`AnimatedCircularProgressBar`) and follows the same `'use client'` + `createClientComponentClient()` + manual `useState`/`useEffect` conventions used throughout `(burnlog)`.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (`@supabase/auth-helpers-nextjs`), Prisma (schema-only, `db push` — no migrations directory), `date-fns` (period math, already a dependency), `recharts` (insights charts, already a dependency), Radix/`components/ui/*` primitives, Tailwind.

## Global Constraints

- No test framework exists in this repo. Verification is `npx next build` + small `ts-node`-run assertion scripts for pure-logic modules (same pattern as `lib/appMode.selftest.ts`), plus manual in-browser checks.
- Schema changes go through `npx prisma db push` (no `prisma/migrations` directory). RLS is applied via the `mcp__supabase__apply_migration` tool (this session has live Supabase MCP access, confirmed connected to this project) rather than asking the user to hand-run SQL in the dashboard — `supabase/rls.sql` is still updated as the version-controlled source of truth per this repo's existing convention.
- Every new table's Supabase access must go through `profileId`, resolved via `profiles.userId = auth.uid()`, matching every existing table.
- Reuse existing shared components (`SmoothTabs`, `MotionCarousel`, `Card`, `Select`, `Input`, `Button`, `Label`, `Skeleton`, `AnimatedCircularProgressBar`) — do not fork or duplicate them.
- No new npm dependencies — `date-fns`, `recharts`, `embla-carousel-react` are already installed.
- Categories/goal types are plain validated strings (`as const` arrays), not DB enums — matches `lib/goalTypes.ts`'s existing convention.
- All amounts are unitless numbers (no currency selector) — matches the design spec's explicit non-goal.

---

### Task 1: Prisma schema, RLS, category & goal-type constants

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`
- Create: `lib/financeCategories.ts`
- Create: `lib/financialGoalTypes.ts`

**Interfaces:**
- Produces (used throughout every later task):
  - `INCOME_CATEGORIES`, `EXPENSE_CATEGORIES` (`{ value: string; label: string }[]`), `categoryLabel(category: string): string` from `lib/financeCategories.ts`.
  - `FINANCIAL_GOAL_TYPES` (`{ value: string; label: string }[]`) from `lib/financialGoalTypes.ts`.
  - DB tables `recurring_items`, `finance_transactions`, `financial_goals`, all RLS-protected identically to every other `profileId`-keyed table.

- [ ] **Step 1: Add the three new models to `prisma/schema.prisma`**

Add three relation lines to the `Profile` model, right after `StaminaSession StaminaSession[]` (before `StepEntry StepEntry[]`):

```prisma
  StaminaSession     StaminaSession[]
  RecurringItem      RecurringItem[]
  FinanceTransaction FinanceTransaction[]
  FinancialGoal      FinancialGoal[]
  StepEntry          StepEntry[]
```

Append these three models at the end of the file, after the `OnboardingPageFlag` model:

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
  frequency   String // 'weekly' | 'monthly' | 'yearly'
  dayOfWeek   Int? // 0-6, used when frequency = 'weekly'
  dayOfMonth  Int? // 1-31, used when frequency = 'monthly' | 'yearly'
  monthOfYear Int? // 1-12, used when frequency = 'yearly'
  startDate   DateTime @default(now())
  endDate     DateTime?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@map("recurring_items")
}

/// one-off income/expense entries (manual logs, not from a recurring template)
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

  @@map("finance_transactions")
}

/// financial goals — savings target, spending cap, debt payoff, investment contribution
model FinancialGoal {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id])
  profileId   String    @db.Uuid
  goalType    String // 'savings_target' | 'spending_cap' | 'debt_payoff' | 'investment_contribution'
  label       String // e.g. "Emergency Fund", "Dining Budget"
  category    String? // used by spending_cap / investment_contribution
  targetValue Float
  targetDate  DateTime?
  createdAt   DateTime  @default(now())

  @@map("financial_goals")
}
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma db push`
Expected: ends with "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Add RLS policies via the live Supabase connection**

Use the `mcp__supabase__apply_migration` tool with `name: "lifelog_finance_rls"` and this `query`:

```sql
do $$
declare
  t text;
begin
  foreach t in array array[
    'recurring_items',
    'finance_transactions',
    'financial_goals'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for all
        using (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
    $f$, t || '_owner_access', t, t, t);
  end loop;
end $$;
```

Expected: migration applies with no errors. Verify with `mcp__supabase__list_tables` (schemas: `["public"]`, verbose: `false`) — confirm `recurring_items`, `finance_transactions`, `financial_goals` appear with `"rls_enabled": true`.

- [ ] **Step 4: Mirror the RLS policy into `supabase/rls.sql` (version-controlled source of truth)**

Edit the `foreach t in array array[...]` list in `supabase/rls.sql` to add the three new table names:

```sql
  foreach t in array array[
    'fitness_goals',
    'workouts',
    'workout_plans',
    'sessions',
    'weight_entries',
    'calorie_burns',
    'food_intakes',
    'stamina_sessions',
    'step_entries',
    'water_entries',
    'recurring_items',
    'finance_transactions',
    'financial_goals'
  ]
```

- [ ] **Step 5: Write `lib/financeCategories.ts`**

```ts
// lib/financeCategories.ts

export const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Salary' },
  { value: 'freelance', label: 'Freelance / Business' },
  { value: 'investment_returns', label: 'Investment Returns' },
  { value: 'other_income', label: 'Other Income' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent / Mortgage' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'mobile_bill', label: 'Mobile / Internet' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'debt_payment', label: 'Debt Payment' },
  { value: 'investment_contribution', label: 'Investment Contribution' },
  { value: 'other_expense', label: 'Other' },
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]['value'];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];

export function categoryLabel(category: string): string {
  const match = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find((c) => c.value === category);
  return match ? match.label : category;
}
```

- [ ] **Step 6: Write `lib/financialGoalTypes.ts`**

```ts
// lib/financialGoalTypes.ts

export const FINANCIAL_GOAL_TYPES = [
  { value: 'savings_target', label: 'Savings Target ($, by date)' },
  { value: 'spending_cap', label: 'Monthly Spending Cap ($, by category or total)' },
  { value: 'debt_payoff', label: 'Debt Payoff Target ($, by date)' },
  { value: 'investment_contribution', label: 'Investment Contribution Goal ($/month)' },
] as const;

export type FinancialGoalType = (typeof FINANCIAL_GOAL_TYPES)[number]['value'];
```

- [ ] **Step 7: Verify the app still builds**

Run: `npx next build`
Expected: succeeds with no errors (new lib files aren't imported anywhere yet, so this just confirms no syntax errors).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql lib/financeCategories.ts lib/financialGoalTypes.ts
git commit -m "feat: add RecurringItem/FinanceTransaction/FinancialGoal models, RLS, and category/goal-type constants"
```

---

### Task 2: Period computation — `lib/financePeriods.ts`

**Files:**
- Create: `lib/financePeriods.ts`
- Create: `lib/financePeriods.selftest.ts`

**Interfaces:**
- Consumes: nothing new (pure `date-fns` + plain data).
- Produces (used by Tasks 4, 6, 9, 10):
  - `type Period = 'weekly' | 'monthly' | 'yearly'`
  - `interface RecurringItemRow { id: string; type: string; category: string; label: string; amount: number; frequency: string; dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null; startDate: string; endDate: string | null; isActive: boolean }`
  - `interface FinanceLineItem { type: string; category: string; amount: number; date: Date }`
  - `function getPeriodRange(period: Period, anchor?: Date): { start: Date; end: Date }`
  - `function expandRecurringInRange(items: RecurringItemRow[], start: Date, end: Date): FinanceLineItem[]`

- [ ] **Step 1: Write `lib/financePeriods.ts`**

```ts
// lib/financePeriods.ts
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  isWithinInterval,
} from 'date-fns';

export type Period = 'weekly' | 'monthly' | 'yearly';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export function getPeriodRange(period: Period, anchor: Date = new Date()): PeriodRange {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case 'monthly':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'yearly':
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }
}

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
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export interface FinanceLineItem {
  type: string;
  category: string;
  amount: number;
  date: Date;
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = endOfMonth(new Date(year, monthIndex, 1)).getDate();
  return Math.min(day, lastDay);
}

export function expandRecurringInRange(
  items: RecurringItemRow[],
  start: Date,
  end: Date
): FinanceLineItem[] {
  const results: FinanceLineItem[] = [];

  for (const item of items) {
    if (!item.isActive) continue;
    const itemStart = new Date(item.startDate);
    const itemEnd = item.endDate ? new Date(item.endDate) : null;
    if (itemStart > end) continue;
    if (itemEnd && itemEnd < start) continue;

    if (item.frequency === 'weekly' && item.dayOfWeek !== null) {
      for (const day of eachDayOfInterval({ start, end })) {
        if (day.getDay() !== item.dayOfWeek) continue;
        if (day < itemStart) continue;
        if (itemEnd && day > itemEnd) continue;
        results.push({ type: item.type, category: item.category, amount: item.amount, date: day });
      }
    } else if (item.frequency === 'monthly' && item.dayOfMonth !== null) {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor <= end) {
        const day = clampDayOfMonth(cursor.getFullYear(), cursor.getMonth(), item.dayOfMonth);
        const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), day);
        if (
          isWithinInterval(occurrence, { start, end }) &&
          occurrence >= itemStart &&
          (!itemEnd || occurrence <= itemEnd)
        ) {
          results.push({ type: item.type, category: item.category, amount: item.amount, date: occurrence });
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else if (item.frequency === 'yearly' && item.dayOfMonth !== null && item.monthOfYear !== null) {
      for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        const monthIndex = item.monthOfYear - 1;
        const day = clampDayOfMonth(year, monthIndex, item.dayOfMonth);
        const occurrence = new Date(year, monthIndex, day);
        if (
          isWithinInterval(occurrence, { start, end }) &&
          occurrence >= itemStart &&
          (!itemEnd || occurrence <= itemEnd)
        ) {
          results.push({ type: item.type, category: item.category, amount: item.amount, date: occurrence });
        }
      }
    }
  }

  return results;
}
```

- [ ] **Step 2: Write `lib/financePeriods.selftest.ts`**

```ts
// lib/financePeriods.selftest.ts
async function main() {
  const { getPeriodRange, expandRecurringInRange } = await import('./financePeriods');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  // getPeriodRange
  const anchor = new Date(2026, 2, 15); // March 15, 2026 (Sunday)
  const weekly = getPeriodRange('weekly', anchor);
  assert(weekly.start.getDate() <= 15 && weekly.end.getDate() >= 15, 'weekly range contains the anchor day');

  const monthly = getPeriodRange('monthly', anchor);
  assert(monthly.start.getMonth() === 2 && monthly.start.getDate() === 1, 'monthly range starts on the 1st');
  assert(monthly.end.getMonth() === 2 && monthly.end.getDate() === 31, 'monthly range ends on the 31st for March');

  const yearly = getPeriodRange('yearly', anchor);
  assert(yearly.start.getMonth() === 0 && yearly.start.getDate() === 1, 'yearly range starts Jan 1');
  assert(yearly.end.getMonth() === 11 && yearly.end.getDate() === 31, 'yearly range ends Dec 31');

  // expandRecurringInRange — weekly
  const weeklyItem = {
    id: '1', type: 'expense', category: 'groceries', label: 'Groceries', amount: 50,
    frequency: 'weekly', dayOfWeek: 1, dayOfMonth: null, monthOfYear: null,
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const monthRange = getPeriodRange('monthly', new Date(2026, 2, 1)); // March 2026 has 5 Mondays
  const weeklyOccurrences = expandRecurringInRange([weeklyItem], monthRange.start, monthRange.end);
  assert(weeklyOccurrences.length === 5, `weekly item expands to 5 Mondays in March 2026 (got ${weeklyOccurrences.length})`);
  assert(weeklyOccurrences.every((o) => o.amount === 50 && o.category === 'groceries'), 'weekly occurrences carry amount/category');

  // expandRecurringInRange — monthly with day-of-month clamping (31st in February)
  const monthlyItem = {
    id: '2', type: 'income', category: 'salary', label: 'Salary', amount: 3000,
    frequency: 'monthly', dayOfWeek: null, dayOfMonth: 31, monthOfYear: null,
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const febRange = getPeriodRange('monthly', new Date(2026, 1, 1)); // Feb 2026, not a leap year -> 28 days
  const febOccurrences = expandRecurringInRange([monthlyItem], febRange.start, febRange.end);
  assert(febOccurrences.length === 1, 'monthly item with dayOfMonth=31 still produces exactly one Feb occurrence');
  assert(febOccurrences[0]?.date.getDate() === 28, `Feb occurrence clamps to the 28th (got ${febOccurrences[0]?.date.getDate()})`);

  // expandRecurringInRange — yearly
  const yearlyItem = {
    id: '3', type: 'expense', category: 'insurance', label: 'Car Insurance', amount: 1200,
    frequency: 'yearly', dayOfWeek: null, dayOfMonth: 15, monthOfYear: 6,
    startDate: new Date(2025, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const yearRange = getPeriodRange('yearly', new Date(2026, 0, 1));
  const yearlyOccurrences = expandRecurringInRange([yearlyItem], yearRange.start, yearRange.end);
  assert(yearlyOccurrences.length === 1, 'yearly item expands to exactly one occurrence per year in range');
  assert(yearlyOccurrences[0]?.date.getMonth() === 5 && yearlyOccurrences[0]?.date.getDate() === 15, 'yearly occurrence lands on June 15');

  // expandRecurringInRange — inactive items excluded
  const inactiveItem = { ...weeklyItem, id: '4', isActive: false };
  assert(expandRecurringInRange([inactiveItem], monthRange.start, monthRange.end).length === 0, 'inactive items produce no occurrences');

  // expandRecurringInRange — items outside the date window excluded
  const futureItem = { ...weeklyItem, id: '5', startDate: new Date(2030, 0, 1).toISOString() };
  assert(expandRecurringInRange([futureItem], monthRange.start, monthRange.end).length === 0, 'items starting after the range produce no occurrences');

  const endedItem = { ...weeklyItem, id: '6', endDate: new Date(2025, 0, 1).toISOString() };
  assert(expandRecurringInRange([endedItem], monthRange.start, monthRange.end).length === 0, 'items ended before the range produce no occurrences');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll financePeriods assertions passed');
}

main();
```

- [ ] **Step 3: Run the self-test**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts`
Expected: all `OK:` lines, ending with "All financePeriods assertions passed", exit code 0.

- [ ] **Step 4: Commit**

```bash
git add lib/financePeriods.ts lib/financePeriods.selftest.ts
git commit -m "feat: add financePeriods module for period ranges and recurring-item expansion"
```

---

### Task 3: Goal progress computation — `lib/financeGoalProgress.ts`

**Files:**
- Create: `lib/financeGoalProgress.ts`
- Create: `lib/financeGoalProgress.selftest.ts`

**Interfaces:**
- Consumes: `FinanceLineItem` from `lib/financePeriods.ts` (Task 2).
- Produces (used by Task 9):
  - `interface FinancialGoalRow { id: string; goalType: string; label: string; category: string | null; targetValue: number; targetDate: string | null; createdAt: string }`
  - `function computeGoalProgress(goal: FinancialGoalRow, itemsSinceGoalCreation: FinanceLineItem[], itemsThisCalendarMonth: FinanceLineItem[]): { current: number; target: number; pct: number }`

- [ ] **Step 1: Write `lib/financeGoalProgress.ts`**

```ts
// lib/financeGoalProgress.ts
import type { FinanceLineItem } from './financePeriods';

export interface FinancialGoalRow {
  id: string;
  goalType: string;
  label: string;
  category: string | null;
  targetValue: number;
  targetDate: string | null;
  createdAt: string;
}

function clampPct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

export function computeGoalProgress(
  goal: FinancialGoalRow,
  itemsSinceGoalCreation: FinanceLineItem[],
  itemsThisCalendarMonth: FinanceLineItem[]
): { current: number; target: number; pct: number } {
  switch (goal.goalType) {
    case 'savings_target': {
      const income = itemsSinceGoalCreation
        .filter((i) => i.type === 'income')
        .reduce((sum, i) => sum + i.amount, 0);
      const expense = itemsSinceGoalCreation
        .filter((i) => i.type === 'expense')
        .reduce((sum, i) => sum + i.amount, 0);
      const current = Math.max(0, income - expense);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    case 'spending_cap': {
      const current = itemsThisCalendarMonth
        .filter((i) => i.type === 'expense' && (!goal.category || i.category === goal.category))
        .reduce((sum, i) => sum + i.amount, 0);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    case 'debt_payoff': {
      const current = itemsSinceGoalCreation
        .filter((i) => i.type === 'expense' && i.category === 'debt_payment')
        .reduce((sum, i) => sum + i.amount, 0);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    case 'investment_contribution': {
      const current = itemsThisCalendarMonth
        .filter((i) => i.type === 'expense' && i.category === 'investment_contribution')
        .reduce((sum, i) => sum + i.amount, 0);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    default:
      return { current: 0, target: goal.targetValue, pct: 0 };
  }
}
```

- [ ] **Step 2: Write `lib/financeGoalProgress.selftest.ts`**

```ts
// lib/financeGoalProgress.selftest.ts
async function main() {
  const { computeGoalProgress } = await import('./financeGoalProgress');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  const baseGoal = { id: '1', label: 'Test', category: null, targetDate: null, createdAt: new Date(2026, 0, 1).toISOString() };

  // savings_target
  const savingsItems = [
    { type: 'income', category: 'salary', amount: 3000, date: new Date(2026, 0, 5) },
    { type: 'expense', category: 'rent', amount: 1000, date: new Date(2026, 0, 6) },
  ];
  const savingsGoal = { ...baseGoal, goalType: 'savings_target', targetValue: 5000 };
  const savingsProgress = computeGoalProgress(savingsGoal, savingsItems, []);
  assert(savingsProgress.current === 2000, `savings_target current = income - expense (got ${savingsProgress.current})`);
  assert(savingsProgress.pct === 40, `savings_target pct = 40 (got ${savingsProgress.pct})`);

  // spending_cap, category-scoped
  const spendingItems = [
    { type: 'expense', category: 'groceries', amount: 150, date: new Date(2026, 0, 10) },
    { type: 'expense', category: 'rent', amount: 1000, date: new Date(2026, 0, 10) },
  ];
  const spendingGoal = { ...baseGoal, goalType: 'spending_cap', category: 'groceries', targetValue: 300 };
  const spendingProgress = computeGoalProgress(spendingGoal, [], spendingItems);
  assert(spendingProgress.current === 150, `spending_cap only counts the goal's category (got ${spendingProgress.current})`);

  // spending_cap, no category (total expense)
  const totalCapGoal = { ...baseGoal, goalType: 'spending_cap', category: null, targetValue: 2000 };
  const totalCapProgress = computeGoalProgress(totalCapGoal, [], spendingItems);
  assert(totalCapProgress.current === 1150, `spending_cap with no category sums all expense (got ${totalCapProgress.current})`);

  // debt_payoff
  const debtItems = [
    { type: 'expense', category: 'debt_payment', amount: 500, date: new Date(2026, 0, 15) },
    { type: 'expense', category: 'rent', amount: 1000, date: new Date(2026, 0, 15) },
  ];
  const debtGoal = { ...baseGoal, goalType: 'debt_payoff', targetValue: 2000 };
  const debtProgress = computeGoalProgress(debtGoal, debtItems, []);
  assert(debtProgress.current === 500, `debt_payoff only counts debt_payment category (got ${debtProgress.current})`);
  assert(debtProgress.pct === 25, `debt_payoff pct = 25 (got ${debtProgress.pct})`);

  // investment_contribution
  const investItems = [
    { type: 'expense', category: 'investment_contribution', amount: 400, date: new Date(2026, 0, 1) },
  ];
  const investGoal = { ...baseGoal, goalType: 'investment_contribution', targetValue: 500 };
  const investProgress = computeGoalProgress(investGoal, [], investItems);
  assert(investProgress.current === 400, `investment_contribution counts this month's contributions (got ${investProgress.current})`);
  assert(investProgress.pct === 80, `investment_contribution pct = 80 (got ${investProgress.pct})`);

  // pct clamped when target is 0 (never divides by zero)
  const zeroTargetGoal = { ...baseGoal, goalType: 'savings_target', targetValue: 0 };
  const zeroProgress = computeGoalProgress(zeroTargetGoal, savingsItems, []);
  assert(zeroProgress.pct === 0, `pct clamps to 0 when target is 0 (got ${zeroProgress.pct})`);

  // pct clamped at 100 even if current exceeds target
  const overGoal = { ...baseGoal, goalType: 'savings_target', targetValue: 1000 };
  const overProgress = computeGoalProgress(overGoal, savingsItems, []);
  assert(overProgress.pct === 100, `pct clamps at 100 when current exceeds target (got ${overProgress.pct})`);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll financeGoalProgress assertions passed');
}

main();
```

- [ ] **Step 3: Run the self-test**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financeGoalProgress.selftest.ts`
Expected: all `OK:` lines, ending with "All financeGoalProgress assertions passed", exit code 0.

- [ ] **Step 4: Commit**

```bash
git add lib/financeGoalProgress.ts lib/financeGoalProgress.selftest.ts
git commit -m "feat: add financeGoalProgress module for per-goal-type progress calculation"
```

---

### Task 4: Recurring-item draft type and `useFinanceData` hook

**Files:**
- Create: `lib/recurringItemDraft.ts`
- Create: `lib/useFinanceData.ts`

**Interfaces:**
- Consumes: `Period`, `RecurringItemRow`, `FinanceLineItem`, `getPeriodRange`, `expandRecurringInRange` from `lib/financePeriods.ts` (Task 2).
- Produces (used by Tasks 6, 7, 8):
  - `interface RecurringItemDraft { type: 'income' | 'expense'; category: string; label: string; amount: number; frequency: 'weekly' | 'monthly' | 'yearly'; dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null }`
  - `function useFinanceData(profileId: string | null, period: Period): { incomeByCategory: Record<string, number>; expenseByCategory: Record<string, number>; totalIncome: number; totalExpense: number; loading: boolean }`

- [ ] **Step 1: Write `lib/recurringItemDraft.ts`**

```ts
// lib/recurringItemDraft.ts

export interface RecurringItemDraft {
  type: 'income' | 'expense';
  category: string;
  label: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'yearly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
}
```

- [ ] **Step 2: Write `lib/useFinanceData.ts`**

```ts
// lib/useFinanceData.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getPeriodRange, expandRecurringInRange } from '@/lib/financePeriods';
import type { Period, RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';

export interface FinanceData {
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  totalIncome: number;
  totalExpense: number;
  loading: boolean;
}

const EMPTY_DATA: FinanceData = {
  incomeByCategory: {},
  expenseByCategory: {},
  totalIncome: 0,
  totalExpense: 0,
  loading: true,
};

export function useFinanceData(profileId: string | null, period: Period): FinanceData {
  const supabase = createClientComponentClient();
  const [data, setData] = useState<FinanceData>(EMPTY_DATA);

  const fetchData = useCallback(async () => {
    if (!profileId) {
      setData({ ...EMPTY_DATA, loading: false });
      return;
    }
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const { start, end } = getPeriodRange(period);

      const [recurringRes, transactionsRes] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase
          .from('finance_transactions')
          .select('*')
          .eq('profileId', profileId)
          .gte('date', start.toISOString())
          .lte('date', end.toISOString()),
      ]);

      const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
      const transactions =
        (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || [];

      const virtualItems = expandRecurringInRange(recurringItems, start, end);
      const allItems: FinanceLineItem[] = [
        ...virtualItems,
        ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
      ];

      const incomeByCategory: Record<string, number> = {};
      const expenseByCategory: Record<string, number> = {};
      let totalIncome = 0;
      let totalExpense = 0;

      for (const item of allItems) {
        if (item.type === 'income') {
          incomeByCategory[item.category] = (incomeByCategory[item.category] || 0) + item.amount;
          totalIncome += item.amount;
        } else if (item.type === 'expense') {
          expenseByCategory[item.category] = (expenseByCategory[item.category] || 0) + item.amount;
          totalExpense += item.amount;
        }
      }

      setData({ incomeByCategory, expenseByCategory, totalIncome, totalExpense, loading: false });
    } catch (error) {
      console.error('Error fetching finance data:', error);
      setData({ ...EMPTY_DATA, loading: false });
    }
  }, [profileId, period, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return data;
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds (still unused by any page, so this only confirms syntax correctness).

- [ ] **Step 4: Commit**

```bash
git add lib/recurringItemDraft.ts lib/useFinanceData.ts
git commit -m "feat: add RecurringItemDraft type and useFinanceData hook"
```

---

### Task 5: `SegmentedRingCard` component

**Files:**
- Create: `components/kokonutui/segmented-ring-card.tsx`

**Interfaces:**
- Produces (used by Task 6):
  - `interface RingSegment { category: string; label: string; value: number; color: string }`
  - `SegmentedRingCard({ title, segments, total, size?, className? }: { title: string; segments: RingSegment[]; total: number; size?: number; className?: string })`

- [ ] **Step 1: Write `components/kokonutui/segmented-ring-card.tsx`**

```tsx
// components/kokonutui/segmented-ring-card.tsx
'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface RingSegment {
  category: string;
  label: string;
  value: number;
  color: string;
}

interface SegmentedRingCardProps {
  title: string;
  segments: RingSegment[];
  total: number;
  size?: number;
  className?: string;
}

export function SegmentedRingCard({ title, segments, total, size = 200, className }: SegmentedRingCardProps) {
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const positiveSegments = segments.filter((s) => s.value > 0);
  const hasData = total > 0 && positiveSegments.length > 0;

  let cumulative = 0;
  const arcs = hasData
    ? positiveSegments.map((seg) => {
        const fraction = seg.value / total;
        const arcLength = fraction * circumference;
        const offset = cumulative;
        cumulative += arcLength;
        return { ...seg, arcLength, offset };
      })
    : [];

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90 transform" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <title>{`${title} breakdown`}</title>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-200/50 dark:text-zinc-800/50"
          />
          {hasData &&
            arcs.map((arc, index) => (
              <motion.circle
                key={arc.category}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${arc.arcLength} ${circumference - arc.arcLength}`}
                strokeDashoffset={-arc.offset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              />
            ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <span className="text-xl font-bold">{hasData ? total.toLocaleString() : 'No data yet'}</span>
        </div>
      </div>
      {hasData && (
        <ul className="w-full space-y-1">
          {positiveSegments.map((seg) => (
            <li key={seg.category} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                {seg.label}
              </span>
              <span className="font-medium">{seg.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/kokonutui/segmented-ring-card.tsx
git commit -m "feat: add SegmentedRingCard composition-ring component"
```

---

### Task 6: Dashboard page — rings, period tabs, get-started card, net summary

**Files:**
- Create: `app/(lifelog)/lifelog/_components/GetStartedCard.tsx`
- Create: `app/(lifelog)/lifelog/_components/NetSummaryCard.tsx`
- Modify: `app/(lifelog)/lifelog/page.tsx` (replace placeholder content)

**Interfaces:**
- Consumes: `useFinanceData` (Task 4); `SegmentedRingCard`, `RingSegment` (Task 5); `INCOME_CATEGORIES`/`EXPENSE_CATEGORIES`/`categoryLabel` (Task 1); `Period` (Task 2); `SmoothTabs`/`TabItem`, `MotionCarousel` (existing, unmodified).
- Produces: nothing new consumed elsewhere — this is the dashboard leaf page.

- [ ] **Step 1: Write `app/(lifelog)/lifelog/_components/GetStartedCard.tsx`**

```tsx
// app/(lifelog)/lifelog/_components/GetStartedCard.tsx
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function GetStartedCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboard to LifeLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add your income sources and recurring expenses to start tracking your budget.
        </p>
        <Button asChild>
          <Link href="/lifelog/onboarding">Get started</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `app/(lifelog)/lifelog/_components/NetSummaryCard.tsx`**

```tsx
// app/(lifelog)/lifelog/_components/NetSummaryCard.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface NetSummaryCardProps {
  income: number;
  expense: number;
}

export function NetSummaryCard({ income, expense }: NetSummaryCardProps) {
  const net = income - expense;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="font-semibold">{income.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expense</p>
          <p className="font-semibold">{expense.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Net</p>
          <p className={cn('font-semibold', net >= 0 ? 'text-emerald-500' : 'text-destructive')}>
            {net.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Replace `app/(lifelog)/lifelog/page.tsx`**

```tsx
// app/(lifelog)/lifelog/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { SegmentedRingCard, type RingSegment } from '@/components/kokonutui/segmented-ring-card';
import { useFinanceData } from '@/lib/useFinanceData';
import { categoryLabel } from '@/lib/financeCategories';
import type { Period } from '@/lib/financePeriods';
import { GetStartedCard } from './_components/GetStartedCard';
import { NetSummaryCard } from './_components/NetSummaryCard';

const periodTabs: TabItem[] = [
  { id: 'weekly', icon: CalendarDays, label: 'Weekly', color: 'var(--chart-1)' },
  { id: 'monthly', icon: CalendarRange, label: 'Monthly', color: 'var(--chart-2)' },
  { id: 'yearly', icon: Calendar, label: 'Yearly', color: 'var(--chart-3)' },
];

const PERIODS: Period[] = ['weekly', 'monthly', 'yearly'];

const RING_COLORS = ['#14B8A6', '#0EA5E9', '#6366F1', '#F59E0B', '#EC4899', '#84CC16', '#F43F5E', '#8B5CF6', '#22C55E', '#EAB308'];

function toSegments(byCategory: Record<string, number>): RingSegment[] {
  return Object.entries(byCategory).map(([category, value], index) => ({
    category,
    label: categoryLabel(category),
    value,
    color: RING_COLORS[index % RING_COLORS.length],
  }));
}

function PeriodSlide({
  profileId,
  period,
  hasAnyData,
}: {
  profileId: string | null;
  period: Period;
  hasAnyData: boolean;
}) {
  const data = useFinanceData(profileId, period);

  return (
    <div className="flex flex-col gap-4">
      {!hasAnyData && !data.loading && <GetStartedCard />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SegmentedRingCard title="Income" segments={toSegments(data.incomeByCategory)} total={data.totalIncome} />
        <SegmentedRingCard title="Expenses" segments={toSegments(data.expenseByCategory)} total={data.totalExpense} />
      </div>
      <NetSummaryCard income={data.totalIncome} expense={data.totalExpense} />
    </div>
  );
}

export default function LifeLogHomePage() {
  const supabase = createClientComponentClient();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hasAnyData, setHasAnyData] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);

      const [{ count: recurringCount }, { count: transactionCount }] = await Promise.all([
        supabase.from('recurring_items').select('id', { count: 'exact', head: true }).eq('profileId', profile.id),
        supabase.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('profileId', profile.id),
      ]);
      setHasAnyData((recurringCount || 0) + (transactionCount || 0) > 0);
    })();
  }, [supabase]);

  return (
    <div className="pb-24">
      <TopBar title="LifeLog" />
      <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <SmoothTabs items={periodTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
      </div>
      <div className="px-4 py-2">
        <MotionCarousel
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          slides={PERIODS.map((period) => (
            <PeriodSlide key={period} profileId={profileId} period={period} hasAnyData={hasAnyData} />
          ))}
        />
      </div>
      <LifeLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Export `RingSegment` from `segmented-ring-card.tsx`**

Confirm the `export interface RingSegment` from Task 5 is already exported (it is, per Task 5 Step 1) — this step is just a check, no edit needed.

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: succeeds; `/lifelog` route compiles with the new dashboard.

- [ ] **Step 6: Commit**

```bash
git add "app/(lifelog)/lifelog/_components" "app/(lifelog)/lifelog/page.tsx"
git commit -m "feat: build LifeLog dashboard with composition rings and period tabs"
```

---

### Task 7: `RecurringItemForm` (shared) + Plan tab

**Files:**
- Create: `components/lifelog/RecurringItemForm.tsx`
- Create: `app/(lifelog)/lifelog/plan/page.tsx`
- Create: `app/(lifelog)/lifelog/plan/_components/RecurringItemsList.tsx`

**Interfaces:**
- Consumes: `RecurringItemDraft` (Task 4); `INCOME_CATEGORIES`/`EXPENSE_CATEGORIES`/`categoryLabel` (Task 1).
- Produces (used by Tasks 8, 9):
  - `RecurringItemForm({ lockedType?, onSubmit, submitLabel? }: { lockedType?: 'income' | 'expense'; onSubmit: (draft: RecurringItemDraft) => void; submitLabel?: string })` from `components/lifelog/RecurringItemForm.tsx` — reused as-is by the onboarding wizard (Task 8).
  - `interface PlanRecurringItem extends RecurringItemDraft { id: string }` exported from `app/(lifelog)/lifelog/plan/page.tsx`. Named distinctly from `lib/financePeriods.ts`'s `RecurringItemRow` (Task 2) — that type carries the full DB row shape (`startDate`/`endDate`/`isActive`/etc., needed for period expansion); this one is a display-only shape (draft fields + `id`) local to the Plan tab's list/delete UI. Never import both under the same name in one file.

`RecurringItemForm` lives under the shared `components/lifelog/` directory (not nested in `plan/_components/`) because it's genuinely used by two separate route segments (Plan tab and the onboarding wizard) — keeping it under one route's `_components/` would make the other route's import reach across route boundaries.

- [ ] **Step 1: Write `components/lifelog/RecurringItemForm.tsx`**

```tsx
// components/lifelog/RecurringItemForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface RecurringItemFormProps {
  lockedType?: 'income' | 'expense';
  onSubmit: (draft: RecurringItemDraft) => void;
  submitLabel?: string;
}

export function RecurringItemForm({ lockedType, onSubmit, submitLabel = 'Add' }: RecurringItemFormProps) {
  const [type, setType] = useState<'income' | 'expense'>(lockedType ?? 'income');
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [category, setCategory] = useState<string>(categories[0].value);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [monthOfYear, setMonthOfYear] = useState('1');
  const [error, setError] = useState('');

  function handleTypeChange(next: 'income' | 'expense') {
    setType(next);
    const nextCategories = next === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setCategory(nextCategories[0].value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amountNum = Number(amount);
    if (!label.trim()) {
      setError('Please enter a label');
      return;
    }
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    onSubmit({
      type,
      category,
      label: label.trim(),
      amount: amountNum,
      frequency,
      dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : null,
      dayOfMonth: frequency === 'monthly' || frequency === 'yearly' ? Number(dayOfMonth) : null,
      monthOfYear: frequency === 'yearly' ? Number(monthOfYear) : null,
    });

    setLabel('');
    setAmount('');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!lockedType && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === 'income' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeChange('income')}
          >
            Income
          </Button>
          <Button
            type="button"
            variant={type === 'expense' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeChange('expense')}
          >
            Expense
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rent" />
      </div>

      <div className="space-y-1.5">
        <Label>Amount</Label>
        <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>

      <div className="space-y-1.5">
        <Label>Frequency</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {frequency === 'weekly' && (
        <div className="space-y-1.5">
          <Label>Day of week</Label>
          <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(frequency === 'monthly' || frequency === 'yearly') && (
        <div className="space-y-1.5">
          <Label>Day of month</Label>
          <Input type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </div>
      )}

      {frequency === 'yearly' && (
        <div className="space-y-1.5">
          <Label>Month</Label>
          <Select value={monthOfYear} onValueChange={setMonthOfYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={month} value={String(index + 1)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 2: Write `app/(lifelog)/lifelog/plan/_components/RecurringItemsList.tsx`**

```tsx
// app/(lifelog)/lifelog/plan/_components/RecurringItemsList.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { categoryLabel } from '@/lib/financeCategories';
import type { PlanRecurringItem } from '../page';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function frequencyLabel(item: PlanRecurringItem): string {
  if (item.frequency === 'weekly') {
    return `Weekly on ${WEEKDAY_SHORT[item.dayOfWeek ?? 0]}`;
  }
  if (item.frequency === 'monthly') {
    const day = item.dayOfMonth ?? 1;
    return `Monthly on the ${day}${ordinalSuffix(day)}`;
  }
  const day = item.dayOfMonth ?? 1;
  return `Yearly on ${MONTH_SHORT[(item.monthOfYear ?? 1) - 1]} ${day}`;
}

interface RecurringItemsListProps {
  items: PlanRecurringItem[];
  onDelete: (id: string) => void;
}

export function RecurringItemsList({ items, onDelete }: RecurringItemsListProps) {
  const income = items.filter((item) => item.type === 'income');
  const expense = items.filter((item) => item.type === 'expense');

  function renderGroup(title: string, group: PlanRecurringItem[]) {
    if (group.length === 0) return null;
    return (
      <Card key={title}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {group.map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  {categoryLabel(item.category)} · {frequencyLabel(item)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{item.amount.toLocaleString()}</span>
                <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.label}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No recurring items yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Add your income sources and recurring expenses below.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {renderGroup('Income', income)}
      {renderGroup('Expenses', expense)}
    </div>
  );
}
```

- [ ] **Step 3: Write `app/(lifelog)/lifelog/plan/page.tsx`**

```tsx
// app/(lifelog)/lifelog/plan/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringItemForm } from '@/components/lifelog/RecurringItemForm';
import { RecurringItemsList } from './_components/RecurringItemsList';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

export interface PlanRecurringItem extends RecurringItemDraft {
  id: string;
}

export default function PlanPage() {
  const supabase = createClientComponentClient();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<PlanRecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchItems = useCallback(
    async (id: string) => {
      setLoading(true);
      const { data } = await supabase
        .from('recurring_items')
        .select('*')
        .eq('profileId', id)
        .eq('isActive', true)
        .order('createdAt', { ascending: false });
      setItems((data as PlanRecurringItem[]) || []);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      fetchItems(profile.id);
    })();
  }, [supabase, fetchItems]);

  async function handleAdd(draft: RecurringItemDraft) {
    if (!profileId) return;
    const { data, error } = await supabase
      .from('recurring_items')
      .insert([{ ...draft, profileId }])
      .select()
      .single();
    if (error) {
      console.error('Error adding recurring item:', error);
      return;
    }
    setItems((prev) => [data as PlanRecurringItem, ...prev]);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('recurring_items').update({ isActive: false }).eq('id', id);
    if (error) {
      console.error('Error deleting recurring item:', error);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <div className="px-4 py-4 flex flex-col gap-4">
        <Link href="/lifelog/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">
          Run setup wizard
        </Link>

        {loading ? <Skeleton className="h-40 w-full" /> : <RecurringItemsList items={items} onDelete={handleDelete} />}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>Add recurring item</CardTitle>
            </CardHeader>
            <CardContent>
              <RecurringItemForm onSubmit={handleAdd} />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowForm(true)}>Add recurring item</Button>
        )}
      </div>
      <LifeLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: succeeds; `/lifelog/plan` compiles.

- [ ] **Step 5: Commit**

```bash
git add components/lifelog/RecurringItemForm.tsx "app/(lifelog)/lifelog/plan"
git commit -m "feat: add shared RecurringItemForm and LifeLog Plan tab"
```

---

### Task 8: Onboarding wizard

**Files:**
- Create: `app/(lifelog)/lifelog/onboarding/page.tsx`
- Create: `app/(lifelog)/lifelog/onboarding/_components/LifeLogOnboardingFlow.tsx`
- Create: `app/(lifelog)/lifelog/onboarding/_components/WelcomeStep.tsx`
- Create: `app/(lifelog)/lifelog/onboarding/_components/IncomeSourcesStep.tsx`
- Create: `app/(lifelog)/lifelog/onboarding/_components/FixedExpensesStep.tsx`
- Create: `app/(lifelog)/lifelog/onboarding/_components/ReviewStep.tsx`

**Interfaces:**
- Consumes: `RecurringItemForm` (Task 7); `RecurringItemDraft` (Task 4); `categoryLabel` (Task 1).
- Produces: nothing consumed elsewhere — this is a leaf flow, entered from the dashboard's `GetStartedCard` (Task 6) and the Plan tab's "Run setup wizard" link (Task 7), both already wired.

- [ ] **Step 1: Write `app/(lifelog)/lifelog/onboarding/_components/WelcomeStep.tsx`**

```tsx
// app/(lifelog)/lifelog/onboarding/_components/WelcomeStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface WelcomeStepProps {
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onStart, onSkip }: WelcomeStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Let&apos;s set up your recurring finances</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add your income sources and fixed expenses so LifeLog can track your budget automatically. You can skip
          any step and add these later from the Plan tab.
        </p>
        <div className="flex gap-2">
          <Button onClick={onStart}>Get started</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `app/(lifelog)/lifelog/onboarding/_components/IncomeSourcesStep.tsx`**

```tsx
// app/(lifelog)/lifelog/onboarding/_components/IncomeSourcesStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { RecurringItemForm } from '@/components/lifelog/RecurringItemForm';
import { categoryLabel } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

interface IncomeSourcesStepProps {
  rows: RecurringItemDraft[];
  onAdd: (draft: RecurringItemDraft) => void;
  onRemove: (index: number) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function IncomeSourcesStep({ rows, onAdd, onRemove, onContinue, onSkip }: IncomeSourcesStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={index} className="flex items-center justify-between border-b pb-2">
                <span>
                  {row.label} ({categoryLabel(row.category)})
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{row.amount}</span>
                  <Button variant="ghost" size="icon" onClick={() => onRemove(index)} aria-label={`Remove ${row.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <RecurringItemForm lockedType="income" onSubmit={onAdd} submitLabel="Add another income source" />
        <div className="flex gap-2">
          <Button onClick={onContinue}>Continue</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `app/(lifelog)/lifelog/onboarding/_components/FixedExpensesStep.tsx`**

```tsx
// app/(lifelog)/lifelog/onboarding/_components/FixedExpensesStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { RecurringItemForm } from '@/components/lifelog/RecurringItemForm';
import { categoryLabel } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

interface FixedExpensesStepProps {
  rows: RecurringItemDraft[];
  onAdd: (draft: RecurringItemDraft) => void;
  onRemove: (index: number) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function FixedExpensesStep({ rows, onAdd, onRemove, onContinue, onSkip }: FixedExpensesStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fixed expenses</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={index} className="flex items-center justify-between border-b pb-2">
                <span>
                  {row.label} ({categoryLabel(row.category)})
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{row.amount}</span>
                  <Button variant="ghost" size="icon" onClick={() => onRemove(index)} aria-label={`Remove ${row.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <RecurringItemForm lockedType="expense" onSubmit={onAdd} submitLabel="Add another expense" />
        <div className="flex gap-2">
          <Button onClick={onContinue}>Continue</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write `app/(lifelog)/lifelog/onboarding/_components/ReviewStep.tsx`**

```tsx
// app/(lifelog)/lifelog/onboarding/_components/ReviewStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { categoryLabel } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

interface ReviewStepProps {
  incomeRows: RecurringItemDraft[];
  expenseRows: RecurringItemDraft[];
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function ReviewStep({ incomeRows, expenseRows, saving, error, onConfirm, onBack }: ReviewStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {incomeRows.length === 0 && expenseRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing added yet — you can always add items later from the Plan tab.
          </p>
        ) : (
          <div className="space-y-3">
            {incomeRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">Income</h3>
                <ul className="space-y-1">
                  {incomeRows.map((row, index) => (
                    <li key={index} className="flex justify-between text-sm">
                      <span>
                        {row.label} ({categoryLabel(row.category)})
                      </span>
                      <span className="font-medium">{row.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {expenseRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">Expenses</h3>
                <ul className="space-y-1">
                  {expenseRows.map((row, index) => (
                    <li key={index} className="flex justify-between text-sm">
                      <span>
                        {row.label} ({categoryLabel(row.category)})
                      </span>
                      <span className="font-medium">{row.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={saving}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Write `app/(lifelog)/lifelog/onboarding/_components/LifeLogOnboardingFlow.tsx`**

```tsx
// app/(lifelog)/lifelog/onboarding/_components/LifeLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { WelcomeStep } from './WelcomeStep';
import { IncomeSourcesStep } from './IncomeSourcesStep';
import { FixedExpensesStep } from './FixedExpensesStep';
import { ReviewStep } from './ReviewStep';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

type Step = 'welcome' | 'income' | 'expenses' | 'review';

export function LifeLogOnboardingFlow() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState<Step>('welcome');
  const [incomeRows, setIncomeRows] = useState<RecurringItemDraft[]>([]);
  const [expenseRows, setExpenseRows] = useState<RecurringItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleSkipAll() {
    router.replace('/lifelog');
  }

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) throw new Error('Profile not found');

      const rows = [...incomeRows, ...expenseRows];
      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('recurring_items')
          .insert(rows.map((row) => ({ ...row, profileId: profile.id })));
        if (insertError) throw insertError;
      }

      router.replace('/lifelog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={() => setStep('income')} onSkip={handleSkipAll} />;
  }
  if (step === 'income') {
    return (
      <IncomeSourcesStep
        rows={incomeRows}
        onAdd={(draft) => setIncomeRows((prev) => [...prev, draft])}
        onRemove={(index) => setIncomeRows((prev) => prev.filter((_, i) => i !== index))}
        onContinue={() => setStep('expenses')}
        onSkip={() => setStep('expenses')}
      />
    );
  }
  if (step === 'expenses') {
    return (
      <FixedExpensesStep
        rows={expenseRows}
        onAdd={(draft) => setExpenseRows((prev) => [...prev, draft])}
        onRemove={(index) => setExpenseRows((prev) => prev.filter((_, i) => i !== index))}
        onContinue={() => setStep('review')}
        onSkip={() => setStep('review')}
      />
    );
  }
  return (
    <ReviewStep
      incomeRows={incomeRows}
      expenseRows={expenseRows}
      saving={saving}
      error={error}
      onConfirm={handleConfirm}
      onBack={() => setStep('expenses')}
    />
  );
}
```

- [ ] **Step 6: Write `app/(lifelog)/lifelog/onboarding/page.tsx`**

No `TopBar`/`BottomNav` wrapper, matching the existing `app/ai-setup/page.tsx` convention of a bare full-screen flow.

```tsx
// app/(lifelog)/lifelog/onboarding/page.tsx
'use client';

import { LifeLogOnboardingFlow } from './_components/LifeLogOnboardingFlow';

export default function LifeLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <LifeLogOnboardingFlow />
    </div>
  );
}
```

- [ ] **Step 7: Verify build**

Run: `npx next build`
Expected: succeeds; `/lifelog/onboarding` compiles.

- [ ] **Step 8: Commit**

```bash
git add "app/(lifelog)/lifelog/onboarding"
git commit -m "feat: add LifeLog onboarding wizard"
```

---

### Task 9: Financial Goals tab

**Files:**
- Create: `app/(lifelog)/lifelog/goals/page.tsx`
- Create: `app/(lifelog)/lifelog/goals/_components/AddFinancialGoalForm.tsx`
- Create: `app/(lifelog)/lifelog/goals/_components/FinancialGoalsList.tsx`

**Interfaces:**
- Consumes: `FINANCIAL_GOAL_TYPES` (Task 1); `EXPENSE_CATEGORIES`, `categoryLabel` (Task 1); `computeGoalProgress`, `FinancialGoalRow` (Task 3); `expandRecurringInRange`, `RecurringItemRow`, `FinanceLineItem` (Task 2); `AnimatedCircularProgressBar` (existing, unmodified).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write `app/(lifelog)/lifelog/goals/page.tsx`**

```tsx
// app/(lifelog)/lifelog/goals/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import { AddFinancialGoalForm } from './_components/AddFinancialGoalForm';
import { FinancialGoalsList } from './_components/FinancialGoalsList';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';

export default function FinancialGoalsPage() {
  const supabase = createClientComponentClient();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [goals, setGoals] = useState<FinancialGoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(
    async (id: string) => {
      setLoading(true);
      const { data } = await supabase
        .from('financial_goals')
        .select('*')
        .eq('profileId', id)
        .order('createdAt', { ascending: false });
      setGoals((data as FinancialGoalRow[]) || []);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      fetchGoals(profile.id);
    })();
  }, [supabase, fetchGoals]);

  function handleGoalAdded(goal: FinancialGoalRow) {
    setGoals((prev) => [goal, ...prev]);
  }

  return (
    <div className="pb-24">
      <TopBar title="Financial Goals" />
      <div className="px-4 py-4 flex flex-col gap-4">
        {loading ? <Skeleton className="h-40 w-full" /> : <FinancialGoalsList goals={goals} profileId={profileId} />}
        {profileId && <AddFinancialGoalForm profileId={profileId} onGoalAdded={handleGoalAdded} />}
      </div>
      <LifeLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(lifelog)/lifelog/goals/_components/AddFinancialGoalForm.tsx`**

```tsx
// app/(lifelog)/lifelog/goals/_components/AddFinancialGoalForm.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FINANCIAL_GOAL_TYPES } from '@/lib/financialGoalTypes';
import { EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';

interface AddFinancialGoalFormProps {
  profileId: string;
  onGoalAdded: (goal: FinancialGoalRow) => void;
}

export function AddFinancialGoalForm({ profileId, onGoalAdded }: AddFinancialGoalFormProps) {
  const supabase = createClientComponentClient();
  const [goalType, setGoalType] = useState<string>(FINANCIAL_GOAL_TYPES[0].value);
  const [label, setLabel] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const needsCategory = goalType === 'spending_cap' || goalType === 'investment_contribution';
  const needsDate = goalType === 'savings_target' || goalType === 'debt_payoff';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const targetNum = Number(targetValue);
    if (!label.trim()) {
      setError('Please enter a label');
      return;
    }
    if (!targetValue || isNaN(targetNum) || targetNum <= 0) {
      setError('Please enter a valid target amount');
      return;
    }

    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from('financial_goals')
        .insert([
          {
            profileId,
            goalType,
            label: label.trim(),
            targetValue: targetNum,
            category: needsCategory ? category : null,
            targetDate: needsDate && targetDate ? targetDate : null,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      onGoalAdded(data as FinancialGoalRow);
      setLabel('');
      setTargetValue('');
      setTargetDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add goal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a financial goal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Goal type</Label>
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINANCIAL_GOAL_TYPES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Emergency Fund" />
          </div>

          <div className="space-y-1.5">
            <Label>Target amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {needsCategory && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsDate && (
            <div className="space-y-1.5">
              <Label>Target date (optional)</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading}>
            {loading ? 'Adding…' : 'Add goal'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `app/(lifelog)/lifelog/goals/_components/FinancialGoalsList.tsx`**

```tsx
// app/(lifelog)/lifelog/goals/_components/FinancialGoalsList.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { FINANCIAL_GOAL_TYPES } from '@/lib/financialGoalTypes';
import { categoryLabel } from '@/lib/financeCategories';
import { computeGoalProgress, type FinancialGoalRow } from '@/lib/financeGoalProgress';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';

interface FinancialGoalsListProps {
  goals: FinancialGoalRow[];
  profileId: string | null;
}

function goalTypeLabel(goalType: string): string {
  return FINANCIAL_GOAL_TYPES.find((g) => g.value === goalType)?.label ?? goalType;
}

export function FinancialGoalsList({ goals, profileId }: FinancialGoalsListProps) {
  const supabase = createClientComponentClient();
  const [recurringItems, setRecurringItems] = useState<RecurringItemRow[]>([]);
  const [transactions, setTransactions] = useState<{ type: string; category: string; amount: number; date: string }[]>([]);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const [recurringRes, transactionsRes] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('finance_transactions').select('*').eq('profileId', profileId),
      ]);
      setRecurringItems((recurringRes.data as RecurringItemRow[]) || []);
      setTransactions(
        (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || []
      );
    })();
  }, [profileId, supabase]);

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No financial goals yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Add your first goal below.</p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  return (
    <div className="space-y-4">
      {goals.map((goal) => {
        const createdAt = new Date(goal.createdAt);

        const sinceCreationItems: FinanceLineItem[] = [
          ...transactions
            .filter((t) => new Date(t.date) >= createdAt)
            .map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
          ...expandRecurringInRange(recurringItems, createdAt, now),
        ];

        const thisMonthItems: FinanceLineItem[] = [
          ...transactions
            .filter((t) => new Date(t.date) >= monthStart && new Date(t.date) <= monthEnd)
            .map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
          ...expandRecurringInRange(recurringItems, monthStart, monthEnd),
        ];

        const progress = computeGoalProgress(goal, sinceCreationItems, thisMonthItems);

        return (
          <Card key={goal.id}>
            <CardHeader>
              <CardTitle>{goal.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <AnimatedCircularProgressBar
                value={progress.pct}
                gaugePrimaryColor="var(--primary)"
                gaugeSecondaryColor="var(--muted)"
                className="size-20 text-sm"
              />
              <div>
                <p className="text-sm text-muted-foreground">{goalTypeLabel(goal.goalType)}</p>
                {goal.category && <p className="text-xs text-muted-foreground">{categoryLabel(goal.category)}</p>}
                <p className="font-semibold">
                  {progress.current.toLocaleString()} / {progress.target.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Export `FinancialGoalRow` type is reused as a page-level import**

`app/(lifelog)/lifelog/goals/page.tsx` (Step 1) imports `FinancialGoalRow` from `@/lib/financeGoalProgress` rather than redefining it locally — confirm this matches Task 3's `export interface FinancialGoalRow` (it does; no edit needed, this step is a consistency check).

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: succeeds; `/lifelog/goals` compiles.

- [ ] **Step 6: Commit**

```bash
git add "app/(lifelog)/lifelog/goals"
git commit -m "feat: add LifeLog Goals tab with auto-derived progress"
```

---

### Task 10: Insights tab

**Files:**
- Create: `app/(lifelog)/lifelog/insights/page.tsx`
- Create: `app/(lifelog)/lifelog/insights/_components/FinanceInsightsClient.tsx`

**Interfaces:**
- Consumes: `expandRecurringInRange`, `RecurringItemRow`, `FinanceLineItem` (Task 2); `categoryLabel` (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write `app/(lifelog)/lifelog/insights/_components/FinanceInsightsClient.tsx`**

```tsx
// app/(lifelog)/lifelog/insights/_components/FinanceInsightsClient.tsx
'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';
import { categoryLabel } from '@/lib/financeCategories';

interface FinanceInsightsClientProps {
  recurringItems: RecurringItemRow[];
  transactions: { type: string; category: string; amount: number; date: string }[];
}

const MONTHS_BACK = 6;

export default function FinanceInsightsClient({ recurringItems, transactions }: FinanceInsightsClientProps) {
  const now = new Date();
  const rangeStart = startOfMonth(subMonths(now, MONTHS_BACK - 1));
  const rangeEnd = endOfMonth(now);

  const allItems: FinanceLineItem[] = useMemo(
    () => [
      ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
      ...expandRecurringInRange(recurringItems, rangeStart, rangeEnd),
    ],
    [transactions, recurringItems, rangeStart, rangeEnd]
  );

  const monthlySeries = useMemo(() => {
    const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
    return months.map((month) => {
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);
      const inMonth = allItems.filter((i) => i.date >= mStart && i.date <= mEnd);
      const income = inMonth.filter((i) => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
      const expense = inMonth.filter((i) => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
      return { month: format(month, 'MMM'), income, expense, net: income - expense };
    });
  }, [allItems, rangeStart, rangeEnd]);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of allItems) {
      if (item.type !== 'expense') continue;
      map[item.category] = (map[item.category] || 0) + item.amount;
    }
    return Object.entries(map).map(([category, amount]) => ({ category: categoryLabel(category), amount }));
  }, [allItems]);

  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of allItems) {
      if (item.type !== 'income') continue;
      map[item.category] = (map[item.category] || 0) + item.amount;
    }
    return Object.entries(map).map(([category, amount]) => ({ category: categoryLabel(category), amount }));
  }, [allItems]);

  const totalIncome = allItems.filter((i) => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
  const totalExpense = allItems.filter((i) => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="font-semibold">{totalIncome.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Expense</p>
            <p className="font-semibold">{totalExpense.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="font-semibold">{net.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Savings Rate</p>
            <p className="font-semibold">{savingsRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cashflow (last {MONTHS_BACK} months)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlySeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#22C55E" />
              <Line type="monotone" dataKey="expense" stroke="#EF4444" />
              <Line type="monotone" dataKey="net" stroke="#3B82F6" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses by category</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={expenseByCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#EF4444" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Income by category</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={incomeByCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#22C55E" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(lifelog)/lifelog/insights/page.tsx`**

```tsx
// app/(lifelog)/lifelog/insights/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import FinanceInsightsClient from './_components/FinanceInsightsClient';

export default async function LifeLogInsightsPage() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return redirect('/login');
  }

  const { data: profile } = await supabase.from('profiles').select('id').eq('userId', session.user.id).single();

  if (!profile) {
    return redirect('/signup/profile');
  }

  const profileId = profile.id;

  const [{ data: recurringItems = [] }, { data: transactions = [] }] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase.from('finance_transactions').select('*').eq('profileId', profileId).order('date', { ascending: true }),
  ]);

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Insights" />
      <main className="flex-1 overflow-auto px-4 py-6 pb-24">
        <FinanceInsightsClient recurringItems={recurringItems || []} transactions={transactions || []} />
      </main>
      <LifeLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds; `/lifelog/insights` compiles.

- [ ] **Step 4: Commit**

```bash
git add "app/(lifelog)/lifelog/insights"
git commit -m "feat: add LifeLog Insights tab with cashflow and category charts"
```

---

### Task 11: `LifeLogBottomNav` — full four-tab navigation

**Files:**
- Modify: `components/LifeLogBottomNav.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is the final wiring task connecting all four LifeLog routes.

- [ ] **Step 1: Replace `components/LifeLogBottomNav.tsx`**

```tsx
// components/LifeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletIcon, CalendarClockIcon, TargetIcon, ChartLineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/lifelog', label: 'Home', Icon: WalletIcon },
  { href: '/lifelog/plan', label: 'Plan', Icon: CalendarClockIcon },
  { href: '/lifelog/goals', label: 'Goals', Icon: TargetIcon },
  { href: '/lifelog/insights', label: 'Insights', Icon: ChartLineIcon },
];

export function LifeLogBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/lifelog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

Note the `isActive` check for `/lifelog` specifically requires an exact match (not `startsWith`), otherwise the Home tab would light up on every LifeLog sub-route (`/lifelog/plan`, `/lifelog/goals`, `/lifelog/insights`) since they all start with `/lifelog`. This mirrors the bug BurnLog's `BottomNav` never hit only because none of its tab paths are prefixes of one another.

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in, switch to LifeLog via the app switcher. Confirm:
- Bottom nav shows Home / Plan / Goals / Insights, each navigating correctly.
- Only the current tab is highlighted (Home is NOT highlighted while on `/lifelog/plan`, etc.).
- Dashboard shows the "Onboard to LifeLog" card on first visit (no recurring items/transactions yet); clicking it opens the wizard.
- Completing the wizard (add one income row, one expense row, confirm) lands back on `/lifelog` with the get-started card gone and both rings showing data.
- Weekly/Monthly/Yearly tabs swipe smoothly and each shows correct totals.
- Plan tab lists the items added via the wizard; add/delete both work.
- Goals tab: add one goal of each type, confirm progress bars render without crashing (0% is fine with no matching transactions yet).
- Insights tab renders all three charts without errors, even with sparse data.

- [ ] **Step 4: Commit**

```bash
git add components/LifeLogBottomNav.tsx
git commit -m "feat: wire full four-tab LifeLog navigation (Home/Plan/Goals/Insights)"
```

---

## Final Verification Checklist

- [ ] `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financePeriods.selftest.ts` passes.
- [ ] `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/financeGoalProgress.selftest.ts` passes.
- [ ] `npx next build` completes with no errors.
- [ ] `mcp__supabase__list_tables` shows `recurring_items`, `finance_transactions`, `financial_goals` all with `rls_enabled: true`.
- [ ] Full manual walkthrough from Task 11 Step 3 passes.
- [ ] BurnLog is entirely unaffected — `/dashboard`, `/goals`, `/session`, `/insights`, `/profile` all still work exactly as before.
