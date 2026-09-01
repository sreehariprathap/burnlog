# MoneyLog

Personal finance sub-app. One of seven sub-apps under LogBook — see the
[root README](../../README.md) for how it fits into the wider app.

## What it does

- **Home** (`/moneylog`) — spending overview, recent transactions.
- **Plan** (`/moneylog/plan`) — budget planning.
- **Goals** (`/moneylog/goals`) — financial goals (savings targets, debt
  payoff, etc).
- **Insights** (`/moneylog/insights`) — spending trends and charts.
- **Onboarding** (`/moneylog/onboarding`) — a budget-setup wizard for new
  MoneyLog users; also relaunchable from Config as "Reonboard".
- **Config** (`/moneylog/config`) — MoneyLog-specific settings, plus
  "Reonboard" (relaunches `/moneylog/onboarding`) and "Export config as
  JSON". Identity (name/avatar/username) lives in LogBook's `/profile`, not
  here.

## Routes

```
/moneylog             Home (spending overview)
/moneylog/plan          Budget planning
/moneylog/goals          Financial goals
/moneylog/insights        Charts & trends
/moneylog/onboarding        Budget setup wizard
/moneylog/config              Settings
```

## Data model

Prisma models: `FinanceTransaction`, `FinancialGoal`. Category definitions
live in `lib/financeCategories.ts`; goal-type logic in
`lib/financialGoalTypes.ts` and `lib/financeGoalProgress.ts`; period
calculations in `lib/financePeriods.ts`. Shares the top-level `Profile`
model with every other app.

## Key files

```
app/(moneylog)/
  layout.tsx              Route-group layout/theming
  moneylog/page.tsx          Home
  moneylog/plan/               Budget planning
  moneylog/goals/                Financial goals
  moneylog/insights/               Charts
  moneylog/onboarding/               Onboarding wizard
  moneylog/config/                     Settings
components/MoneyLogBottomNav.tsx        MoneyLog's bottom nav
lib/useFinanceData.ts                    Shared finance data hook
```
