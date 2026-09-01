# Shared Stat-Card Design System — Design Spec

## Goal

BurnLog's dashboard has a distinct, more polished visual language for its
stat/KPI-style widgets — a neon-gradient-bordered card (`NeonGradientCard`)
and an animated circular progress ring (`AnimatedCircularProgressBar`) —
that the other six sub-apps + LogBook don't share. Extract that language
into two reusable, app-agnostic primitives, then apply them everywhere a
stat/summary widget already exists (LogBook, MoneyLog, TaskLog, TravelLog),
and design new stat widgets for the three apps that currently have none
(HomeLog, SocialLog, ShoppingLog).

Every app keeps its own accent color — the primitives read CSS custom
properties (`--primary`, `--chart-2`, …) that the app switcher already sets
via `.app-<id>` theme classes (`lib/appMode.ts` → `setAppTheme`), so the
same component glows orange in BurnLog, green in MoneyLog, blue in TaskLog,
etc., with no per-call-site color plumbing.

## Non-goals

- Restyling list/feed/board content: SocialLog's feed posts, ShoppingLog's
  listing grid, TaskLog's kanban board, HomeLog's chore/bill list rows,
  message threads, and forms all keep their current (already-consistent)
  plain `Card` styling. Only stat/KPI-shaped widgets are in scope.
- New Prisma models or columns. Every new widget in this spec is computed
  from data that already exists.
- A generic "widget grid" layout system — each app keeps its existing page
  structure; only the individual widget components change.
- Migrating `NeonGradientCard`/`AnimatedCircularProgressBar` usages that
  don't represent a stat/KPI (there are none today outside the ones listed
  below).

## Part 1 — Shared primitives

Two new components in `components/ui/`, built on the existing primitives
already used by BurnLog:

### `components/ui/stat-card.tsx`

```ts
interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title?: string;
  neonColors?: { firstColor: string; secondColor: string }; // default below
  borderSize?: number;   // passed through to NeonGradientCard, default 2
  borderRadius?: number; // passed through to NeonGradientCard, default 16
  children: ReactNode;
}
```

Wraps `NeonGradientCard`. Default `neonColors`:

```ts
{ firstColor: 'var(--primary)', secondColor: 'var(--chart-2)' }
```

These are literal CSS custom-property references, not resolved hex —
`NeonGradientCard` already accepts any valid CSS color string for
`neonColors` (it interpolates them directly into an inline
`linear-gradient(...)` style value), so passing `var(--primary)` means the
browser re-evaluates the gradient whenever the active `.app-*` class
changes the variable. No JS color resolution, no re-render needed on app
switch.

Renders an optional `icon` + `title` header row (matching
`GoalProgressWidget`'s current `<div className="flex items-center
justify-between">` pattern) above `children`, so callers only supply the
body content.

### `components/ui/stat-ring.tsx`

```ts
interface StatRingProps {
  value: number;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg'; // maps to size-16 / size-24 / size-32
  showValue?: boolean;
}
```

Thin wrapper over `AnimatedCircularProgressBar` with themed defaults:
`gaugePrimaryColor: 'var(--primary)'`,
`gaugeSecondaryColor: 'color-mix(in oklch, var(--primary) 15%, transparent)'`
(matching the ~15%-opacity secondary track BurnLog's `GoalProgressWidget`
already uses, expressed as a CSS var-relative mix instead of a hardcoded
rgba so it tracks the app's primary color).

Both components are purely additive — nothing existing imports or renders
them yet, so landing them has zero visual effect until call sites adopt
them.

## Part 2 — Restyle pass (existing widgets)

| App | File | Current | Change |
|---|---|---|---|
| LogBook | `components/logbook/DayScoreRing.tsx` | `AnimatedCircularProgressBar` in plain `Card` | Swap to `StatRing`, wrap in `StatCard` |
| LogBook | `components/logbook/StreakBadge.tsx` | custom bordered `div` | Convert to `StatCard` |
| LogBook | `components/logbook/LogCardsGrid.tsx` | plain `Card` bento tiles, per-app-colored linear bar | Wrap each tile in `StatCard`; keep the existing linear progress bar and per-app tile color as-is (it already encodes *another* app's color when shown from LogBook, which `StatCard`'s own theme-based glow would clash with — see Open question below) |
| MoneyLog | `_components/NetSummaryCard.tsx`, `_components/NetWorthCard.tsx` | plain `Card` | Convert to `StatCard` |
| MoneyLog | `components/kokonutui/DualRingCard` usage on home page | hand-rolled SVG ring | Replace with `StatRing` |
| MoneyLog | `goals/_components/FinancialGoalsList.tsx` | already `AnimatedCircularProgressBar` w/ `var(--primary)`, plain `Card` | Swap ring to `StatRing`, wrap in `StatCard` |
| TaskLog | streak row on `app/(tasklog)/tasklog/page.tsx` | bare flex `div`, not a card | Convert to `StatCard` |
| TaskLog | `goals/_components/GoalCard.tsx` | linear `bg-primary` progress bar, plain `Card` | Replace bar with `StatRing`, wrap in `StatCard` |
| TravelLog | 3-column stat `Card` on `app/(travellog)/travellog/page.tsx` | one `Card`, 3 text columns, no ring | Split into three `StatCard`s in a `grid-cols-3` row |

**Open question flagged for the plan step:** LogBook's `LogCardsGrid` tiles
already use each *other* app's color to identify which app a tile
summarizes (that's the point of the grid — a MoneyLog tile is green, a
TaskLog tile is blue, regardless of LogBook's own indigo theme). `StatCard`
defaults to the *ambient* theme's `--primary`, which on the LogBook hub is
LogBook's own indigo, not the tile's app color. So `LogCardsGrid` needs to
pass an explicit `neonColors` override per tile (reusing
`lib/search/registry.ts`'s existing `appSearchColor(app)` map, which
already solves exactly this "color for another app, outside that app's
theme context" problem for `GlobalSearch`) rather than relying on
`StatCard`'s default. This is a per-tile prop, not a design change to
`StatCard` itself.

## Part 3 — New widgets

Three apps have no stat/KPI widget today. New metrics are chosen to need
**no new schema** — only new read queries against existing tables — and to
mirror an app's most-checked existing page:

### HomeLog (`app/(homelog)/homelog/page.tsx`)

Two `StatCard`s at the top of the household overview:

- **"Chores due today"** — count of `household_chore_instances` where
  `dueDate = today AND completedAt IS NULL` for the active household. New
  query, same shape as the existing chores-page fetch.
- **"Your balance"** — net of what the current member owes vs. is owed,
  reusing the *existing* `/api/homelog/balances` endpoint and
  `lib/homelog/expenseBalances.ts` (already computes pairwise balances for
  the Bills page) — summed across all `otherId` rows for the current
  profile into one signed number. No new backend logic, just a new
  consumer of an existing endpoint.

Neither is naturally a percentage, so both render as plain numbers in
`StatCard`s — no `StatRing` forced in for its own sake.

### SocialLog (`app/(sociallog)/sociallog/page.tsx`)

Two `StatCard`s: **"Followers"** (count of `social_follows` where
`followingId = me`) and **"Posts"** (count of `social_posts` where
`profileId = me`). Simple counts, no ring — there's no streak/gamification
field on `Profile` for SocialLog and this spec isn't adding one.

### ShoppingLog (`app/(shoppinglog)/shoppinglog/page.tsx`)

Two `StatCard`s: **"Active listings"** (count of `shop_listings` where
`sellerId = me AND status = 'active'`) and **"Orders this month"** (count
of `shop_orders` where `buyerId = me OR sellerId = me`, `createdAt` in the
current calendar month).

All six new widgets are read-only counts fetched once per page load via
`useSWR`, following the same pattern every other per-app home page already
uses (e.g. TravelLog's existing stat fetch, MoneyLog's `NetSummaryCard`
fetch) — no new data-fetching pattern introduced.

## Testing

- Manual verification per app: switch into each app via the app switcher,
  confirm the new/restyled `StatCard`/`StatRing` instances render in that
  app's accent color (not BurnLog's orange) and that the border-glow
  animation runs.
- Dark mode check for each app's `.app-*.dark` variant, since
  `color-mix`/`var()`-based colors must resolve correctly in both.
- Confirm `LogCardsGrid` tiles still show each *other* app's color, not the
  ambient LogBook theme color (the Part 2 open question above).
- No regression check needed for feeds/listings/kanban/lists since they're
  untouched.

## Rollout

Land as one plan with per-app phases (foundation primitives first, then
one phase per app) rather than a single sweeping commit, so each phase is
independently reviewable — but all phases belong to this one spec/plan per
the user's request to do this in one pass rather than splitting into
separate specs.
