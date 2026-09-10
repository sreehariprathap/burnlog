# MoneyLog: savings buckets, richer recurring frequencies, spendable tracker — design

## Problem

MoneyLog has no way to earmark money toward specific goals (travel fund, car
fund, new shoes) while still seeing what's actually free to spend day to day.
`FinancialGoal` exists but is a passive target, not something you add money
to incrementally. Separately, `RecurringItem.frequency` only supports
`weekly | monthly | yearly` — it can't model a semi-monthly salary (15th +
last day of month) or a true biweekly (every 14 days), so any budget/income
math built on top of it is already wrong for a large class of real pay
schedules. Recurring occurrences are also purely virtual: `expandRecurringInRange`
computes dates on the fly, but nothing ever records that a specific
occurrence actually happened — there's no hook to trigger anything when a
paycheck lands.

## Goal

1. Let a user create named savings buckets (Travel, Car, New Shoes, ...),
   manually add/withdraw money against them, optionally with a target amount
   and date.
2. Let income recurring items auto-split into buckets (e.g. "20% of every
   paycheck → Travel") when that paycheck is logged.
3. Extend `RecurringItem` to support `biweekly` (every 14 days from an
   anchor date) and `semimonthly` (two fixed calendar dates a month,
   including "last day of month" as one of them) in addition to the existing
   `weekly | monthly | yearly`.
4. Give recurring items a real, loggable occurrence — a "log payday" /
   "log bill" action that creates the transaction and (for income) fires
   bucket rules — replacing the current fully-virtual/no-hook model.
5. Surface a "spendable this week / this biweek" card on Home: projected
   income minus projected bills minus bucket contributions, against actual
   spending logged so far.

Out of scope: real money movement between accounts (buckets are a tracking
ledger, not tied to `Asset` balances or `FinanceTransaction`); auto-rule
overflow protection (rules summing over 100% of a paycheck are allowed, not
blocked); notifications/push reminders for unlogged occurrences (the Home
prompt is enough for v1).

## Data model

All new tables/columns live in `prisma/schema.prisma`, additive only — no
existing columns removed or repurposed.

### `RecurringItem` additions

- `frequency` gains two enum values: `biweekly`, `semimonthly` (existing:
  `weekly | monthly | yearly`).
- `anchorDate DateTime?` — reference payday for `biweekly`; occurrences are
  every 14 days from this date, in both directions.
- `secondDayOfMonth Int?` — second calendar date for `semimonthly` (the
  first date reuses the existing `dayOfMonth` column). Value `0` is the
  sentinel for "last day of month" (so a 15th + last-day salary is
  `dayOfMonth=15, secondDayOfMonth=0`). Any other value is a literal day
  number; if it exceeds the days in a given month it clamps to that month's
  last day (same clamping behavior `dayOfMonth` presumably already needs for
  monthly frequency on the 31st).
- Both new columns are nullable and unused by the existing three
  frequencies — no migration data backfill needed.

### `RecurringItemOccurrence` (new)

Records that a specific scheduled date was actually logged.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `recurringItemId` | fk → RecurringItem | cascade delete |
| `occurrenceDate` | Date | the scheduled date this occurrence fulfills |
| `financeTransactionId` | fk → FinanceTransaction, unique | the transaction created when logged |
| `createdAt` | timestamp | |

Unique constraint on `(recurringItemId, occurrenceDate)` — a given scheduled
date can only be logged once.

### `FinanceTransaction` addition

- `recurringItemId FK?` (nullable) — set when the transaction originates
  from logging a recurring occurrence. Enables "show me all transactions
  from this recurring item" without joining through the occurrence table.

### `SavingsBucket` (new)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `profileId` | fk → Profile | |
| `name` | string | |
| `targetAmount` | decimal? | optional |
| `targetDate` | date? | optional |
| `archivedAt` | timestamp? | soft-close, preserves history |
| `createdAt` | timestamp | |

Current balance and target progress are **computed** by summing
`BucketEntry` rows, not stored — avoids denormalization drift.

### `BucketEntry` (new — the ledger)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `bucketId` | fk → SavingsBucket | cascade delete |
| `type` | enum `contribution \| withdrawal` | |
| `amount` | decimal | always positive; `type` gives sign |
| `note` | string? | |
| `source` | enum `manual \| auto_rule` | |
| `sourceRecurringItemId` | fk → RecurringItem? | set when `source = auto_rule` |
| `createdAt` | timestamp | |

Withdrawals only affect the bucket's own balance — they do **not** create a
`FinanceTransaction` and do not feed the spendable formula. Buckets are a
fully separate ledger from real transactions, per the earlier design
decision to keep them independent of `FinancialGoal`/`Asset`.

### `BucketAllocationRule` (new)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `recurringItemId` | fk → RecurringItem | must be an income-type item (validated at write time, not DB-enforced) |
| `bucketId` | fk → SavingsBucket | |
| `mode` | enum `fixed_amount \| percentage` | |
| `value` | decimal | dollar amount or percentage points |
| `isActive` | boolean | default true |
| `createdAt` | timestamp | |

No validation that active rules on one recurring item sum to ≤ 100% —
over-allocation is visible in the resulting bucket entries, not blocked.

## Occurrence logging flow

1. Home screen expands each active `RecurringItem`'s schedule (via the
   updated `expandRecurringInRange`) for a lookback/lookahead window (e.g.
   past 7 days through today), and for each expected date checks whether a
   matching `RecurringItemOccurrence` already exists.
2. Unlogged expected dates render as prompts (e.g. "Log payday — Salary,
   $X, was due Sep 15" for income, "Log bill — Rent, $Y, due today" for
   expenses), reusing `LogTransactionModal` pre-filled from the
   `RecurringItem`.
3. Confirming creates, in one transaction: the `FinanceTransaction` (stamped
   with `recurringItemId`), the `RecurringItemOccurrence` row linking them,
   and — only for income items — evaluates active `BucketAllocationRule`s
   for that item and inserts one `BucketEntry` (`contribution`,
   `source: auto_rule`) per rule, `fixed_amount` rules using `value`
   directly and `percentage` rules using `value / 100 * transaction.amount`.
4. A user can also log a one-off transaction unrelated to any recurring
   item exactly as today — this flow is additive, not a replacement for
   manual logging.

## Spendable-this-period tracker

New Home card: **"$X left to spend this week"** (or "...this biweek", via a
toggle).

- Period boundaries reuse the existing `Profile.moneylogWeekStart` config.
  Biweekly pairs two consecutive weekly periods, grouped deterministically
  from a fixed epoch (Unix epoch week parity) rather than new config — no
  new settings screen needed.
- **Projected income** = sum of expanded recurring income occurrences whose
  scheduled date falls in the current period (using the frequency engine
  from the section above, so semimonthly/biweekly salaries project
  correctly even before being logged).
- **Projected bills** = same, for recurring expense items.
- **Bucket contributions** = sum of `BucketEntry` (`contribution`) rows
  created within the current period (manual + auto_rule combined).
- **Spendable** = projected income − projected bills − bucket contributions.
- **Spent so far** = sum of actual `FinanceTransaction` expenses logged
  within the current period (unrelated to bucket entries).
- Displayed as spendable target with a spent/remaining bar underneath.

## UI

- New route `app/(moneylog)/moneylog/buckets/` — list screen (cards showing
  name, balance, progress bar if target set) + detail screen (ledger of
  entries, add/withdraw drawers, edit target, manage allocation rules),
  following the existing `AddAssetDrawer` / `UpdateBalanceDrawer` pattern
  for consistency.
- Allocation rules are managed from a bucket's detail screen ("Auto-add
  from..." section) and are also visible/editable from the recurring item's
  edit form (so a user editing "Salary" can see/add bucket splits in one
  place).
- Home screen gains: the spendable tracker card, and "Log payday"/"Log
  bill" prompts for unlogged occurrences (see Occurrence logging flow).
- Recurring item add/edit form gains `biweekly` and `semimonthly` frequency
  options, with `semimonthly` showing two date pickers (second one offering
  a "last day of month" toggle that sets `secondDayOfMonth = 0`) and
  `biweekly` showing a single anchor-date picker.

## API

Following the existing Route Handler + service-role pattern used by
assets/balance/pay (not the direct-client pattern used by goals, since
buckets involve multi-row transactional writes — occurrence logging touches
3 tables atomically):

- `app/api/moneylog/buckets/route.ts` — list/create buckets
- `app/api/moneylog/buckets/[id]/route.ts` — get/update/archive bucket
- `app/api/moneylog/buckets/[id]/entries/route.ts` — add manual
  contribution/withdrawal
- `app/api/moneylog/buckets/[id]/rules/route.ts` — list/create allocation
  rules for a bucket (and a symmetric list by `recurringItemId` for the
  recurring-item edit form)
- `app/api/moneylog/recurring-items/[id]/log-occurrence/route.ts` — the
  atomic "log payday/bill" action described above

## Testing

- `lib/financePeriods.test.ts` — new cases for `biweekly` (every-14-days,
  including anchor-date edge cases) and `semimonthly` (including the
  last-day-of-month sentinel and short-month clamping, e.g. Feb 30 → Feb 28).
- New `lib/moneylog/buckets.test.ts` — balance/progress computation from
  `BucketEntry` sums, allocation rule math (fixed vs percentage).
- New `lib/moneylog/spendable.test.ts` — the spendable formula across
  weekly/biweekly periods, including period-boundary edge cases (an
  occurrence landing exactly on a period boundary).
- Route handler tests for `log-occurrence` covering: idempotency (logging
  the same date twice is rejected via the unique constraint), and that
  bucket rules only fire for income-type items.

## Migration

Single additive Prisma migration: 4 new tables
(`RecurringItemOccurrence`, `SavingsBucket`, `BucketEntry`,
`BucketAllocationRule`), 2 new enum values on
`RecurringItem.frequency`, 2 new nullable columns on `RecurringItem`
(`anchorDate`, `secondDayOfMonth`), 1 new nullable FK column on
`FinanceTransaction` (`recurringItemId`). No backfill required — all new
columns are nullable/additive and existing rows remain valid under the
current three frequencies.
