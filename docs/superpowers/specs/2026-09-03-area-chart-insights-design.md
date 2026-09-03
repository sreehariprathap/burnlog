# Area Chart Insights + Cohort Benchmarking

## Problem

BurnLog and MoneyLog's Insights pages render time-series data as `LineChart`s
(and two category breakdowns as `BarChart`s). The user wants the
time-series charts restyled as shadcn-style area charts, and wants a new
"vs peers" comparison view added, reusing IntelLog's existing cohort
percentile data (`intel_cohort_stats`, built in the IntelLog work) rather
than inventing a new benchmarking data source.

## Goals

- Vendor shadcn's chart primitives (`components/ui/chart.tsx`) as the
  shared infra for both pages.
- Convert BurnLog's per-metric trend chart (weight/calories/food/stamina)
  and MoneyLog's cashflow chart (income/expense/net) from line charts to
  area charts.
- Add a new "vs Peers" tab to each insights page: the user's own recent
  value as a filled area, with the cohort's p25–p75 range shown as a
  shaded band behind it and p50 as a dashed reference line.
- BurnLog's benchmark panel uses `workoutsPerWeek`; MoneyLog's uses
  `budgetPct` — the two metrics IntelLog already computes cohort stats
  for. No new snapshot/cohort metrics are added in this pass.

## Non-goals

- Not converting the two category `BarChart`s (expense-by-category,
  income-by-category) to area charts — they're discrete categories, not a
  continuous series; an area chart would misrepresent them.
- Not adding benchmark data for weight or income/expense amounts — those
  aren't in `intel_cohort_stats` and aren't good cross-user comparison
  metrics (absolute, sensitive, unnormalized). Confirmed with the user.
- Not touching any other app's insights/analytics views (only
  BurnLog/MoneyLog were asked about).

## Data flow: new benchmark endpoint

`GET /api/intellog/benchmark?app=<app>&metric=<metric>`

Follows the existing `life-score-trend` route's pattern: `createClient()`
resolves the caller's session and profile id, `createServiceRoleClient()`
does the actual query (bypassing RLS, matching how `intel_snapshots`/
`intel_cohort_stats` are read elsewhere in IntelLog).

1. Look up the caller's `fitness_goals.goalType` and `profiles.age`,
   compute `cohortKey` via the existing `buildCohortKey` (`lib/intellog/cohort.ts`).
2. Query `intel_snapshots` for the caller's own `metric` values over the
   last 30 days (filtered by `app`).
3. Query `intel_cohort_stats` for the same `cohortKey`/`app`/`metric` over
   the same window.
4. Merge by date into `{ date, own: number | null, p25: number | null, p50: number | null, p75: number | null }[]`
   via a new pure function `lib/intellog/benchmark.ts#mergeBenchmarkSeries`
   (unit tested — dates with only one side present still produce a row,
   with the missing side `null`).

## Component design

### `components/ui/chart.tsx`

Vendored as-is from shadcn's registry (`https://ui.shadcn.com/r/styles/new-york/chart.json`).
Exports `ChartContainer`, `ChartConfig`, `ChartTooltip`, `ChartTooltipContent`,
`ChartLegend`, `ChartLegendContent`. Colors are set via `ChartConfig`'s
`color` field as plain `var(--chart-N)` strings — this repo's `--chart-1..5`
are already full `oklch()` values (not bare HSL triplets), matching how
existing recharts usage in this codebase already references them directly.

### `components/insights/BenchmarkAreaChart.tsx`

```ts
interface BenchmarkAreaChartProps {
  app: string;
  metric: string;
  label: string;
  unit: string;
}
```

Fetches the endpoint via SWR. Renders a `ComposedChart`:
- `p25` (stacked, transparent) + a second stacked area sized `p75 - p25`
  (shaded, `var(--muted-foreground)` at low opacity) — the classic
  stacked-area technique for rendering a min/max band.
- `p50` as a dashed `Line` (`var(--muted-foreground)`).
- `own` as a solid gradient `Area` (`var(--chart-1)`), drawn last so it
  sits on top of the band.

When every point's `p25`/`p50`/`p75` is `null` (cohort hasn't met the
sample-size gate yet for this profile's cohort), renders an explicit
"Not enough similar users yet to compare" empty state instead of a chart
with an invisible band.

### Existing chart conversions

- `InsightsClient.tsx`'s `MetricSlide`: `LineChart` → `ComposedChart` with
  a gradient `Area` for the metric (replacing the solid `Line`) and the
  existing dashed goal-reference `Line` kept unchanged.
- `FinanceInsightsClient.tsx`'s cashflow chart: `LineChart` → `AreaChart`
  with three overlapping (not stacked) semi-transparent gradient areas for
  income/expense/net.
- Both pages gain a 5th `SmoothTabs` entry ("vs Peers") whose slide is the
  `BenchmarkAreaChart`, following the same `insightTabs`/`MotionCarousel`
  pattern already used for the other slides.

## Testing

- Unit tests for `mergeBenchmarkSeries`: own-only dates, cohort-only
  dates, both-present dates, and the "all cohort fields null" case that
  triggers the empty state.
- No component tests for the chart conversions or `BenchmarkAreaChart`
  itself — no existing precedent for testing chart components in this
  repo; verified by running the production build (catches the kind of
  route-export and type mismatches that bit the IntelLog/Ask-AI work) and
  manually in the browser where feasible.
