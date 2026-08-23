# LifeLog Core Features — Design (Sub-Project 2)

**Date:** 2026-08-22
**Status:** Approved design, pending spec self-review
**Parent effort:** LifeLog is the second app in the BurnLog shell (see `2026-08-22-lifelog-app-shell-design.md`, already implemented — route groups, theming, app switcher, default boot). This spec covers LifeLog's **actual product features**: dashboard, recurring income/expense management, an onboarding wizard, financial goals, and insights.

## Goal

Give LifeLog a working four-tab app (Home / Plan / Goals / Insights — mirroring BurnLog's nav) for tracking income, expenses, and financial goals, with:
- A dashboard showing two composition rings (income by category, expense by category) across Weekly/Monthly/Yearly periods, swipeable like BurnLog's Goals tabs.
- Recurring income/expense templates, manageable from a "Plan" tab and seedable via a dedicated onboarding wizard.
- Financial goals (savings target, spending cap, debt payoff, investment contribution) with automatically-derived progress.
- An insights tab charting cashflow and category breakdowns over time.

## Non-Goals

- Grocery list generation from budget goals (mentioned in the original ask, deferred to a future sub-project — needs its own design once this data model exists to build on).
- BurnLog → LifeLog data integration / "investment mindset" coaching content (future sub-project).
- A third top-level "investments" ring — investments are represented as an expense category (`investment_contribution`) and as a dedicated goal type, not a separate ring.
- Multi-currency support — amounts are unitless numbers, consistent with how BurnLog treats weight/calories (no currency selector).
- Any change to BurnLog's own tables, goals, or UI.

## Decisions (locked during brainstorming)

1. **Ring style:** Composition rings — each ring is one arc-per-category donut, not a progress-to-target fill.
2. **Recurring model:** Templates (`RecurringItem`) computed on read via period-range expansion; separate `FinanceTransaction` table for one-off entries. Nothing is materialized/duplicated into rows.
3. **Nav:** LifeLog gets the full four-tab structure — Home / Plan / Goals / Insights — matching BurnLog's `BottomNav`.
4. **Goal types:** `savings_target`, `spending_cap`, `debt_payoff`, `investment_contribution`.
5. **Onboarding:** A dedicated multi-step wizard (mirrors `ai-setup`'s step-machine shape, no AI calls), reachable from a first-time "Get started"/"Onboard to LifeLog" card on the dashboard and again anytime from the Plan tab.

## Architecture

Builds entirely inside the existing `(lifelog)` route group (see shell spec). New Prisma models, new `lib/` helpers, new `_components/` folders per route — following the exact conventions already used throughout `(burnlog)`.

```
app/(lifelog)/
  layout.tsx                         # unchanged (sets active app + theme)
  lifelog/
    page.tsx                         # REPLACED: dashboard (rings + period tabs)
    _components/
      IncomeExpenseRingCard.tsx
      GetStartedCard.tsx
      NetSummaryCard.tsx
    plan/
      page.tsx                       # NEW: recurring item list + add/edit
      _components/
        RecurringItemForm.tsx
        RecurringItemsList.tsx
    goals/
      page.tsx                       # NEW: financial goals list + add
      _components/
        AddFinancialGoalForm.tsx
        FinancialGoalsList.tsx
    insights/
      page.tsx                       # NEW: charts
      _components/
        FinanceInsightsClient.tsx
    onboarding/
      page.tsx                       # NEW: wizard entry
      _components/
        LifeLogOnboardingFlow.tsx
        WelcomeStep.tsx
        IncomeSourcesStep.tsx
        FixedExpensesStep.tsx
        ReviewStep.tsx

lib/
  financeCategories.ts                # INCOME_CATEGORIES / EXPENSE_CATEGORIES
  financialGoalTypes.ts                # FINANCIAL_GOAL_TYPES
  financePeriods.ts                    # getPeriodRange, expandRecurringInRange
  financeGoalProgress.ts               # per-goalType progress calculators
  useFinanceData.ts                    # shared fetch+compute hook for a period

components/
  LifeLogBottomNav.tsx                 # MODIFIED: add Plan/Goals/Insights tabs
  kokonutui/segmented-ring-card.tsx    # NEW: composition ring (arc-per-category)

prisma/schema.prisma                   # MODIFIED: 3 new models
supabase/rls.sql                       # MODIFIED: RLS for 3 new tables
```

## Data model

```prisma
/// recurring income/expense templates — expanded into period ranges at read time, never materialized into rows
model RecurringItem {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile  @relation(fields: [profileId], references: [id])
  profileId   String   @db.Uuid
  type        String   // 'income' | 'expense'
  category    String   // e.g. 'salary', 'rent', 'mobile_bill', 'other_expense'
  label       String   // user-facing name, e.g. "Rent"
  amount      Float
  frequency   String   // 'weekly' | 'monthly' | 'yearly'
  dayOfWeek   Int?     // 0-6, used when frequency = 'weekly'
  dayOfMonth  Int?     // 1-31, used when frequency = 'monthly' | 'yearly'
  monthOfYear Int?     // 1-12, used when frequency = 'yearly'
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
  type      String   // 'income' | 'expense'
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
  goalType    String    // 'savings_target' | 'spending_cap' | 'debt_payoff' | 'investment_contribution'
  label       String    // e.g. "Emergency Fund", "Dining Budget"
  category    String?   // used by spending_cap / investment_contribution
  targetValue Float
  targetDate  DateTime? // used by savings_target / debt_payoff
  createdAt   DateTime  @default(now())

  @@map("financial_goals")
}
```

The `Profile` model gains three new relation arrays: `RecurringItem[]`, `FinanceTransaction[]`, `FinancialGoal[]`.

**Categories** (`lib/financeCategories.ts`, same shape as `lib/goalTypes.ts` — a plain `as const` array, validated client-side, not a DB enum):

```ts
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
```

**RLS:** `recurring_items`, `finance_transactions`, `financial_goals` get the same per-profile policy as every existing BurnLog table (added to `supabase/rls.sql`'s `do $$ ... foreach t in array [...]` loop). Schema applied via `npx prisma db push` (this repo has no `prisma/migrations` directory — confirmed existing convention), RLS hand-run in the Supabase SQL editor per the file's own header instructions.

## Period computation — `lib/financePeriods.ts`

```ts
export type Period = 'weekly' | 'monthly' | 'yearly';

export function getPeriodRange(period: Period, anchor: Date = new Date()): { start: Date; end: Date };
// weekly  → date-fns startOfWeek/endOfWeek
// monthly → date-fns startOfMonth/endOfMonth
// yearly  → date-fns startOfYear/endOfYear

export function expandRecurringInRange(
  items: RecurringItemRow[],
  start: Date,
  end: Date
): { type: string; category: string; amount: number; date: Date }[];
// For each active item (isActive, startDate <= end, endDate is null or >= start):
//   weekly:  one occurrence per matching dayOfWeek date inside [start, end)
//   monthly: one occurrence per matching dayOfMonth date inside [start, end)
//   yearly:  one occurrence on (monthOfYear, dayOfMonth) if inside [start, end)
// Returns virtual line items — never written to the DB.
```

`date-fns` is already a project dependency and already used by `InsightsClient`, so no new dependency is introduced.

## Dashboard (`app/(lifelog)/lifelog/page.tsx`)

Structure mirrors BurnLog's Goals page: `SmoothTabs` (Weekly/Monthly/Yearly) + `MotionCarousel` (3 slides), reusing both components as-is from `components/kokonutui/`.

Each slide renders, for its period's date range (via `useFinanceData(profileId, period)`):
- `IncomeExpenseRingCard` — two `SegmentedRingCard`s side by side (or stacked on narrow screens): Income (arcs: salary/freelance/investment_returns/other_income) and Expense (arcs: rent/utilities/mobile_bill/.../other_expense).
- `NetSummaryCard` — Income total, Expense total, Net (income − expense), styled with existing `Card` primitives.
- `GetStartedCard` — shown only when the profile has zero `RecurringItem`s and zero `FinanceTransaction`s. Reads "Onboard to LifeLog" and links to `/lifelog/onboarding`. Mirrors BurnLog dashboard's existing `SetGoalsPrompt` visually (same `Card` treatment), but as a dedicated component since it launches a different action.

**`useFinanceData(profileId, period)`** (`lib/useFinanceData.ts`): fetches `recurring_items` (all active for the profile) and `finance_transactions` (rows with `date` inside the resolved period range) via `createClientComponentClient()`, calls `expandRecurringInRange` for the same range, merges both into `{ incomeByCategory: Record<string, number>, expenseByCategory: Record<string, number>, totalIncome: number, totalExpense: number, loading: boolean }`.

**`SegmentedRingCard`** (`components/kokonutui/segmented-ring-card.tsx`): one ring per card, arcs per category. Props:

```ts
export interface RingSegment {
  category: string;
  label: string;
  value: number;   // absolute amount
  color: string;
}

interface SegmentedRingCardProps {
  title: string;         // "Income" | "Expenses"
  segments: RingSegment[];
  total: number;
  size?: number;         // default 200, matches AppleActivityCard's default
}
```

Internally: compute each segment's share of `total`, lay out consecutive `<circle>` arcs via `strokeDasharray`/`strokeDashoffset` (same technique as `CircleProgress` in `apple-activity-card.tsx`, generalized to N segments instead of 1), each with its own gradient `<linearGradient>`. Center label shows the total amount. A small legend list below the ring shows category → amount, reusing the ring's colors.

## Plan tab (`app/(lifelog)/lifelog/plan/page.tsx`)

Lists all `RecurringItem`s grouped under "Income" and "Expenses" headers (`RecurringItemsList`), each row: label, amount, frequency (+ resolved day, e.g. "Monthly on the 1st"), category, edit/delete actions. "Add recurring item" button opens `RecurringItemForm` (used both here and, unchanged, embedded inside the onboarding wizard's Income/Expense steps).

**`RecurringItemForm`** fields: type toggle (income/expense) → category `Select` (options filtered from `INCOME_CATEGORIES`/`EXPENSE_CATEGORIES` by type) → label `Input` → amount `Input` (number) → frequency `Select` (weekly/monthly/yearly) → conditional day field(s):
- `weekly` → day-of-week `Select` (Sun–Sat)
- `monthly` → day-of-month `Input` (1–31)
- `yearly` → month `Select` (Jan–Dec) + day-of-month `Input`

Also includes a "Run setup wizard" link at the top of the Plan tab, routing to `/lifelog/onboarding`, available any time (not just first-run).

## Onboarding wizard (`app/(lifelog)/lifelog/onboarding/`)

Step machine modeled on `AiSetupFlow`'s `useState<Step>` pattern, no AI calls:

1. **Welcome** — short intro card, "Get started" / "Skip for now" (skip routes straight to `/lifelog`).
2. **Income sources** — repeatable list of `RecurringItemForm` rows (type locked to `income`), "Add another income source", "Continue" / "Skip".
3. **Fixed expenses** — same repeatable UI, type locked to `expense`, "Continue" / "Skip".
4. **Review** — summary of everything entered across both steps (label, amount, frequency, category), "Confirm" bulk-inserts all rows as `RecurringItem`s in one Supabase `insert([...])` call, then `router.replace('/lifelog')`.

State shape: `{ incomeRows: RecurringItemDraft[], expenseRows: RecurringItemDraft[] }`, held in the flow component and only persisted on the Review step's confirm — mirrors `AiSetupFlow` holding `lifestyle`/`goals`/etc. in state until the final save.

## Goals tab (`app/(lifelog)/lifelog/goals/page.tsx`)

Mirrors BurnLog's Goals-page CRUD pattern (`AddGoalForm` + `GoalsList`) exactly, retargeted at `FinancialGoal`:

```ts
// lib/financialGoalTypes.ts
export const FINANCIAL_GOAL_TYPES = [
  { value: 'savings_target', label: 'Savings Target ($, by date)' },
  { value: 'spending_cap', label: 'Monthly Spending Cap ($, by category or total)' },
  { value: 'debt_payoff', label: 'Debt Payoff Target ($, by date)' },
  { value: 'investment_contribution', label: 'Investment Contribution Goal ($/month)' },
] as const;
```

`AddFinancialGoalForm`: goalType `Select` → label `Input` → targetValue `Input` → conditional `category` `Select` (shown for `spending_cap`/`investment_contribution`, options from `EXPENSE_CATEGORIES`) → conditional `targetDate` (shown for `savings_target`/`debt_payoff`).

`FinancialGoalsList`: renders each goal with a progress bar (reusing existing UI primitives) computed via `lib/financeGoalProgress.ts`:

```ts
function clampPct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

// `items` = FinanceTransaction rows + expandRecurringInRange(...) virtual occurrences,
// both already shaped as { type: 'income'|'expense'; category: string; amount: number; date: Date }
export function computeGoalProgress(
  goal: FinancialGoalRow,
  itemsSinceGoalCreation: { type: string; category: string; amount: number; date: Date }[],
  itemsThisCalendarMonth: { type: string; category: string; amount: number; date: Date }[]
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

`itemsSinceGoalCreation` and `itemsThisCalendarMonth` are both precomputed by the caller (dashboard/goals page) by combining `FinanceTransaction` rows with `expandRecurringInRange` occurrences over the relevant range (goal's `createdAt` → now, or current calendar month respectively) — `computeGoalProgress` itself stays a pure function with no data fetching.

All four branches derive progress from real transaction/recurring data — no manually-updated counter field, matching how BurnLog's `weight_loss` goal derives progress from `WeightEntry` history rather than a stored running value.

## Insights tab (`app/(lifelog)/lifelog/insights/_components/FinanceInsightsClient.tsx`)

Structural twin of BurnLog's `InsightsClient` (same `recharts` + `date-fns` dependencies, no new libraries):
- Line/area chart: net cashflow over a selectable date range.
- Bar chart: expense breakdown by category (and a second for income by category) for the selected range.
- Summary stat row: total income, total expense, net, savings rate (`net / income * 100`, guarded against division by zero).

Server component `app/(lifelog)/lifelog/insights/page.tsx` fetches all `recurring_items` + `finance_transactions` for the profile (same guard pattern as BurnLog's `insights/page.tsx`: session check → profile lookup → redirect if missing) and passes them to the client component, which does the range-filtering/aggregation client-side (mirrors the existing insights page's server-fetch/client-compute split).

## Navigation

`components/LifeLogBottomNav.tsx` gains three tabs, matching `BottomNav`'s existing tab shape:

```ts
const tabs = [
  { href: '/lifelog', label: 'Home', Icon: WalletIcon },
  { href: '/lifelog/plan', label: 'Plan', Icon: CalendarClockIcon },
  { href: '/lifelog/goals', label: 'Target' /* reuse TargetIcon */ },
  { href: '/lifelog/insights', label: 'Insights', Icon: ChartLineIcon },
];
```

(Icons finalized during implementation to whatever's visually distinct from BurnLog's own nav icons, avoiding confusion when switching apps.)

## Error handling

- Empty period (no income/expense data): rings render as a single neutral-gray full circle with "No data yet" center label, not a crash or NaN.
- `RecurringItem` with `dayOfMonth` > days-in-month for a given month (e.g. 31 in February): `expandRecurringInRange` clamps to the last day of that month (via `date-fns`'s `endOfMonth`), never throws.
- Goal progress division by zero (e.g. `spending_cap` with `targetValue = 0`): `pct` clamped to `0`, never `Infinity`/`NaN`.
- All Supabase calls follow the existing pattern: try/catch, `console.error`, user-facing fallback state — consistent with every existing BurnLog page.

## Testing

- No test framework in this repo (confirmed in the shell sub-project) — verification is manual against `npm run dev`, plus small `ts-node`-run assertion scripts (same pattern as `lib/appMode.selftest.ts`) for the pure logic modules: `lib/financePeriods.ts` (`expandRecurringInRange` correctness across weekly/monthly/yearly, month-end clamping) and `lib/financeGoalProgress.ts` (all four goal-type branches).
- Manual/e2e: onboarding wizard skip-at-each-step behavior; Plan tab CRUD; dashboard rings render correctly with zero data, one category, and many categories; period tab swipe; Goals progress bars update after adding a transaction; Insights charts render with empty and populated data.

## Rollout / ordering

1. Prisma schema (3 models) + RLS + category/goal-type consts + period/goal-progress lib modules (+ their self-test scripts).
2. `SegmentedRingCard` component.
3. Dashboard page (rings + period tabs + `useFinanceData`).
4. Plan tab (list + form).
5. Onboarding wizard (reuses `RecurringItemForm` from step 4).
6. Goals tab.
7. Insights tab.
8. `LifeLogBottomNav` update (last, once all four routes exist) + `GetStartedCard` wiring on the dashboard.
