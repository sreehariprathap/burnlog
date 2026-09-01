# Shared Stat-Card Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract BurnLog's neon-bordered stat card (`NeonGradientCard`) and animated progress ring (`AnimatedCircularProgressBar`) into two reusable, per-app-themed primitives (`StatCard`, `StatRing`), then apply them to every stat/KPI-style widget across all 7 apps + LogBook — restyling the ones that already exist, and building new ones for the three apps (HomeLog, SocialLog, ShoppingLog) that have none today.

**Architecture:** `StatCard` wraps the existing `components/ui/neon-gradient-card.tsx` with defaults that reference CSS custom properties (`var(--primary)`, `var(--chart-2)`) instead of hardcoded hex — since these are literal CSS var references (not JS-resolved colors), the same component automatically re-themes whenever the active `.app-<id>` class changes those variables, with zero color props needed at call sites. `StatRing` wraps `components/ui/animated-circular-progress-bar.tsx` the same way. The three new-widget apps get new read-only count queries against existing tables — no schema changes anywhere in this plan.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 CSS custom properties (`app/globals.css`), Supabase (browser client for direct queries, `createServiceRoleClient` for new API routes), `useSWR` for data fetching — all matching existing per-app conventions.

**Spec:** `docs/superpowers/specs/2026-09-01-shared-stat-card-design-system.md`

## Global Constraints

- No test framework exists in this repo (no vitest/jest, no `*.test.ts` files anywhere). Every task's "test" step is `npx tsc --noEmit -p .` (must stay clean, ignoring any pre-existing unrelated errors already present on `master`) plus a concrete manual verification procedure (dev-server click-through) — do not introduce a test framework as part of this plan.
- `StatCard`/`StatRing` are additive primitives — nothing renders them until a task explicitly swaps a call site onto them. Landing Task 1 alone must cause zero visual change anywhere except the one call site it converts (BurnLog's `GoalProgressWidget`, which is folded into Task 1 to prove the primitive works end-to-end).
- Per-app accent colors are never hardcoded at call sites — `StatCard`/`StatRing` read the ambient `--primary`/`--chart-2` CSS variables by default. The one exception is LogBook's `LogCardsGrid` (Task 3), which intentionally overrides the color per-tile because each tile represents *another* app's data while sitting inside LogBook's own theme — it reuses the existing `appSearchColor(app)` map from `lib/search/registry.ts` for this, the same helper `GlobalSearch` already uses for the identical problem.
- `StatCard` defaults to `z-0` (see Task 1) rather than `NeonGradientCard`'s own `z-10` default, because `TopBar` is `sticky top-0 z-10` and a same-z-index card later in the DOM paints over it on scroll (this exact bug was already fixed one-off in `GoalProgressWidget`; Task 1 fixes it at the primitive level instead and removes the one-off).
- Feeds, listing grids, kanban boards, list rows, message threads, and forms are explicitly out of scope everywhere in this plan — only stat/KPI-style widgets are touched.
- New API routes (Tasks 9, 10) follow the exact existing auth boilerplate: `createClient()` (from `@/lib/supabase/server`) for `auth.getUser()`, `createServiceRoleClient()` (from `@/lib/supabase/serviceRole`) for all data reads, a local `getMyProfileId(admin, userId)` helper — copy this pattern verbatim from `app/api/shoppinglog/orders/route.ts`, don't invent a new one.

---

### Task 1: Shared primitives — `StatCard` and `StatRing`, dogfooded in BurnLog

**Files:**
- Create: `components/ui/stat-card.tsx`
- Create: `components/ui/stat-ring.tsx`
- Modify: `app/(burnlog)/burnlog/dashboard/_components/GoalProgressWidget.tsx`

**Interfaces:**
- Produces: `StatCard({ icon?, title?, neonColors?, borderSize?, borderRadius?, className?, children, ...divProps })` — a styled wrapper around `NeonGradientCard`. `title` accepts `React.ReactNode`, not just `string`, so callers can put extra markup (e.g. a badge) next to it.
- Produces: `StatRing({ value, min?, max?, size?, showValue?, className? })` — `size` is `'sm' | 'md' | 'lg'` mapping to `size-16`/`size-24`/`size-32`, default `'md'`.

- [ ] **Step 1: Create `components/ui/stat-card.tsx`**

```tsx
// components/ui/stat-card.tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NeonGradientCard } from '@/components/ui/neon-gradient-card';
import { cn } from '@/lib/utils';

interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  title?: ReactNode;
  neonColors?: { firstColor: string; secondColor: string };
  borderSize?: number;
  borderRadius?: number;
  children: ReactNode;
}

// var() references, not resolved colors — the gradient re-evaluates whenever
// the active .app-<id> class changes these variables, so every app's
// StatCard glows in that app's own accent with no color prop needed.
const DEFAULT_NEON = { firstColor: 'var(--primary)', secondColor: 'var(--chart-2)' };

/**
 * BurnLog's neon-bordered stat-card look, generalized for every app.
 * NeonGradientCard hardcodes z-10, which ties with TopBar's sticky z-10 and
 * loses on scroll (later DOM order wins the tie) — StatCard drops to z-0 by
 * default so the header always stays on top.
 */
export function StatCard({
  icon: Icon,
  title,
  neonColors = DEFAULT_NEON,
  borderSize = 2,
  borderRadius = 16,
  className,
  children,
  ...props
}: StatCardProps) {
  const hasHeader = Boolean(title || Icon);
  return (
    <NeonGradientCard
      className={cn('z-0', className)}
      borderSize={borderSize}
      borderRadius={borderRadius}
      neonColors={neonColors}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-center justify-between">
          {title && <span className="font-semibold">{title}</span>}
          {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
        </div>
      )}
      <div className={cn(hasHeader && 'mt-4')}>{children}</div>
    </NeonGradientCard>
  );
}
```

- [ ] **Step 2: Create `components/ui/stat-ring.tsx`**

```tsx
// components/ui/stat-ring.tsx
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sm: 'size-16 text-sm',
  md: 'size-24 text-xl',
  lg: 'size-32 text-2xl',
} as const;

interface StatRingProps {
  value: number;
  min?: number;
  max?: number;
  size?: keyof typeof SIZE_CLASS;
  showValue?: boolean;
  className?: string;
}

/**
 * Themed AnimatedCircularProgressBar — same var(--primary)-based coloring
 * LogBook's DayScoreRing already pioneered, generalized for every app.
 */
export function StatRing({ value, min = 0, max = 100, size = 'md', showValue, className }: StatRingProps) {
  return (
    <AnimatedCircularProgressBar
      value={value}
      min={min}
      max={max}
      showValue={showValue}
      gaugePrimaryColor="var(--primary)"
      gaugeSecondaryColor="color-mix(in oklch, var(--primary) 15%, transparent)"
      className={cn(SIZE_CLASS[size], className)}
    />
  );
}
```

- [ ] **Step 3: Migrate `GoalProgressWidget.tsx` onto the new primitives**

Replace the full contents of `app/(burnlog)/burnlog/dashboard/_components/GoalProgressWidget.tsx`:

```tsx
'use client';

import { Target } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { StatRing } from '@/components/ui/stat-ring';
import { Skeleton } from '@/components/ui/skeleton';

type Goal = {
  id: string;
  goalType: string;
  targetValue: number;
  currentValue?: number;
  unit: string;
};

type GoalProgressWidgetProps = {
  goal?: Goal;
  loading?: boolean;
};

export function GoalProgressWidget({
  goal = {
    id: '1',
    goalType: 'weight_loss',
    targetValue: 70,
    currentValue: 75,
    unit: 'kg',
  },
  loading = false,
}: GoalProgressWidgetProps) {
  if (loading) {
    return (
      <StatCard className="col-span-4" title="Goal Progress" icon={Target}>
        <div className="flex items-center gap-5">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </StatCard>
    );
  }

  if (!goal) {
    return (
      <StatCard className="col-span-4" title="Goal Progress" icon={Target}>
        <div className="text-sm text-muted-foreground">Set a goal to track your progress</div>
      </StatCard>
    );
  }

  const formattedGoalType = goal.goalType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const calculateProgress = () => {
    if (goal.currentValue === undefined) return 0;

    if (goal.goalType === 'weight_loss') {
      if (goal.currentValue >= 100) return 0;
      if (goal.currentValue <= goal.targetValue) return 100;
      const totalToLose = 100 - goal.targetValue;
      const lostSoFar = 100 - goal.currentValue;
      return Math.round((lostSoFar / totalToLose) * 100);
    }

    const percentage = Math.round((goal.currentValue / goal.targetValue) * 100);
    return Math.min(percentage, 100);
  };

  const progress = calculateProgress();

  return (
    <StatCard className="col-span-4" title={formattedGoalType} icon={Target}>
      <div className="flex items-center gap-5">
        <StatRing value={progress} size="md" />
        <div className="flex-1 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current</span>
            <span className="font-medium">
              {goal.currentValue} {goal.unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Target</span>
            <span className="font-medium">
              {goal.targetValue} {goal.unit}
            </span>
          </div>
          <div className="pt-1 text-xs text-muted-foreground">{progress}% complete</div>
        </div>
      </div>
    </StatCard>
  );
}
```

This intentionally changes the widget's second gradient color from the old
hardcoded hot-pink (`#FF3D71`) to `var(--chart-2)` (a darker orange variant
in BurnLog's root theme) — that's the point of the migration: one themed
color pair instead of a hardcoded one.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors introduced by these three files (the repo may already have unrelated pre-existing errors elsewhere — ignore those).

- [ ] **Step 5: Manual verification**

Run `npm run dev`, sign in, navigate to `/burnlog/dashboard`, scroll so the "Weight Loss" (or current goal type) card passes under the sticky header — confirm the header stays on top (this is the z-index bug fix) and the card still shows its neon border + animated ring exactly as before. Toggle dark mode (the theme switch in the top bar) and confirm the card's border/background still render correctly — `color-mix(in oklch, var(--primary) 15%, transparent)` and `var(--chart-2)` must resolve in both `:root` and `.dark`.

- [ ] **Step 6: Commit**

```bash
git add components/ui/stat-card.tsx components/ui/stat-ring.tsx "app/(burnlog)/burnlog/dashboard/_components/GoalProgressWidget.tsx"
git commit -m "feat(ui): add shared StatCard/StatRing primitives, migrate BurnLog's GoalProgressWidget"
```

---

### Task 2: LogBook — DayScoreRing and StreakBadge

**Files:**
- Modify: `components/logbook/DayScoreRing.tsx`
- Modify: `components/logbook/StreakBadge.tsx`
- Modify: `app/(logbook)/logbook/page.tsx` (the `Card`/`CardContent` wrapper around `DayScoreRing`, currently around line 112 — find it by the `<DayScoreRing` usage rather than trusting the line number, since other tasks in this session may shift it)

**Interfaces:**
- Consumes: `StatCard`, `StatRing` from Task 1.

- [ ] **Step 1: Convert `DayScoreRing.tsx` to use `StatRing`**

Replace the full contents of `components/logbook/DayScoreRing.tsx`:

```tsx
// components/logbook/DayScoreRing.tsx
import { StatRing } from '@/components/ui/stat-ring';

interface DayScoreRingProps {
  score: number | null;
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Crushing it';
  if (score >= 60) return 'On track';
  if (score >= 30) return 'Getting started';
  return 'Just beginning';
}

export function DayScoreRing({ score }: DayScoreRingProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <StatRing value={score ?? 0} size="lg" className="text-4xl" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Day Score</span>
      <p className="text-sm font-medium text-muted-foreground">
        {score === null ? 'Log something to get your score' : scoreLabel(score)}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Convert `logbook/page.tsx`'s wrapper `Card` to `StatCard`**

In `app/(logbook)/logbook/page.tsx`, find:

```tsx
            <Card>
              <CardContent className="pt-6">
                <DayScoreRing score={data.dayScore} />
              </CardContent>
            </Card>
```

Replace with:

```tsx
            <StatCard>
              <DayScoreRing score={data.dayScore} />
            </StatCard>
```

Add the import near the other `@/components/logbook/*` imports:

```tsx
import { StatCard } from '@/components/ui/stat-card';
```

If `Card`/`CardContent` are no longer referenced anywhere else in this file after this change, remove them from the `import { Card, CardContent } from '@/components/ui/card';` line — check with `grep -n "Card\b" "app/(logbook)/logbook/page.tsx"` first, since the error-state block a few lines below also renders a `Card`.

- [ ] **Step 3: Convert `StreakBadge.tsx` to use `StatCard`**

Replace the full contents of `components/logbook/StreakBadge.tsx`:

```tsx
// components/logbook/StreakBadge.tsx
import { Flame } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';

interface StreakBadgeProps {
  streak: number;
  streakApps: string[];
}

export function StreakBadge({ streak, streakApps }: StreakBadgeProps) {
  if (streakApps.length === 0) {
    return null;
  }

  return (
    <StatCard>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
          <Flame className={streak > 0 ? 'h-5 w-5 text-orange-500' : 'h-5 w-5 text-muted-foreground'} />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {streak > 0 ? `${streak}-day unified streak` : 'No active streak'}
          </p>
          <p className="text-xs text-muted-foreground">
            Logged across {streakApps.length} app{streakApps.length === 1 ? '' : 's'} every day
          </p>
        </div>
      </div>
    </StatCard>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean (aside from any pre-existing unrelated errors).

- [ ] **Step 5: Manual verification**

`npm run dev`, navigate to `/logbook`, confirm the Day Score ring and streak badge both render inside indigo-glowing neon-bordered cards (LogBook's `--primary` is indigo, not BurnLog's orange — this is the per-app theming working).

- [ ] **Step 6: Commit**

```bash
git add components/logbook/DayScoreRing.tsx components/logbook/StreakBadge.tsx "app/(logbook)/logbook/page.tsx"
git commit -m "feat(logbook): restyle DayScoreRing and StreakBadge with shared StatCard/StatRing"
```

---

### Task 3: LogBook — LogCardsGrid tiles (per-tile app color override)

**Files:**
- Modify: `components/logbook/LogCardsGrid.tsx`

**Interfaces:**
- Consumes: `StatCard` from Task 1, `appSearchColor(app: AppId): string` from `lib/search/registry.ts` (already exists, used today by `GlobalSearch`).

- [ ] **Step 1: Replace `Card` with `StatCard`, using each tile's own app color**

Replace the full contents of `components/logbook/LogCardsGrid.tsx`:

```tsx
// components/logbook/LogCardsGrid.tsx
'use client';

import { Flame, ListChecks, Wallet, House, MessageCircle, ShoppingBag, ArrowRight, type LucideIcon } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { BentoGrid } from '@/components/ui/bento-grid';
import { cn } from '@/lib/utils';
import { useAppSwitch } from '@/lib/appSwitchContext';
import type { AppId } from '@/lib/appMode';
import type { LogbookCard } from '@/lib/logbook/today';
import { appSearchColor } from '@/lib/search/registry';

const CARD_META: Record<LogbookCard['app'], { icon: LucideIcon; color: string; appId: AppId }> = {
  burnlog: { icon: Flame, color: '#F97316', appId: 'burnlog' },
  tasklog: { icon: ListChecks, color: '#3B82F6', appId: 'tasklog' },
  moneylog: { icon: Wallet, color: '#22C55E', appId: 'moneylog' },
  homelog: { icon: House, color: '#9253DA', appId: 'homelog' },
  sociallog: { icon: MessageCircle, color: '#A10059', appId: 'sociallog' },
  shoppinglog: { icon: ShoppingBag, color: '#D46000', appId: 'shoppinglog' },
};

// Hero tiles bookend the grid — everything else sits two-per-row between them.
const HERO_SPAN: Partial<Record<LogbookCard['app'], string>> = {
  burnlog: 'col-span-2 lg:col-span-3',
  shoppinglog: 'col-span-2 lg:col-span-3',
};

function formatValue(card: LogbookCard): string {
  if (!card.available) return 'Coming soon';
  if (card.app === 'moneylog') {
    return `₹${Math.round(card.value).toLocaleString()} / ₹${Math.round(card.target).toLocaleString()}`;
  }
  if (card.app === 'tasklog' || card.app === 'homelog') {
    return `${card.value} / ${card.target} ${card.unit}`;
  }
  if (card.app === 'sociallog' || card.app === 'shoppinglog') {
    return `${card.value} ${card.unit}`;
  }
  return `${Math.round(card.value).toLocaleString()} / ${Math.round(card.target).toLocaleString()} ${card.unit}`;
}

interface LogCardsGridProps {
  cards: LogbookCard[];
}

export function LogCardsGrid({ cards }: LogCardsGridProps) {
  const { switchTo } = useAppSwitch();

  return (
    <BentoGrid>
      {cards.map((card) => {
        const meta = CARD_META[card.app];
        const Icon = meta.icon;
        const disabled = !card.available;
        const isHero = card.app in HERO_SPAN;
        // Each tile represents ANOTHER app's data while sitting inside
        // LogBook's own indigo theme — override StatCard's ambient-theme
        // default with that app's own color, the same lookup GlobalSearch
        // uses for the identical "another app's color, outside its theme
        // context" problem.
        const tileColor = appSearchColor(meta.appId);

        return (
          <StatCard
            key={card.app}
            onClick={() => switchTo(meta.appId)}
            neonColors={{ firstColor: tileColor, secondColor: `${tileColor}99` }}
            className={cn(
              'relative overflow-hidden group',
              HERO_SPAN[card.app],
              disabled ? 'opacity-70' : 'cursor-pointer transition-transform active:scale-[0.98]'
            )}
          >
            <div className={cn('flex flex-col gap-2', isHero && 'lg:flex-row lg:items-center lg:justify-between')}>
              <div className={cn('flex flex-1 flex-col gap-2', isHero && 'lg:flex-row lg:items-center lg:gap-4')}>
                <div className="flex items-center justify-between">
                  <Icon className={cn('h-5 w-5', isHero && 'lg:h-6 lg:w-6')} style={{ color: meta.color }} />
                  {card.pct !== null && (
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground lg:hidden">
                      {card.pct}%
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-sm font-semibold">{formatValue(card)}</p>
                </div>
              </div>
              {card.pct !== null && (
                <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', isHero && 'lg:w-40')}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, card.pct)}%`, backgroundColor: meta.color }}
                  />
                </div>
              )}
            </div>
            {!disabled && (
              <ArrowRight
                className="pointer-events-none absolute right-3 top-3 size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
              />
            )}
          </StatCard>
        );
      })}
    </BentoGrid>
  );
}
```

Note: `StatCard` doesn't accept an `onClick` prop explicitly in its type, but it spreads `...props` (typed as `React.HTMLAttributes<HTMLDivElement>`, which includes `onClick`) onto `NeonGradientCard`, which spreads its own `...props` onto the outer `div` — so `onClick` reaches the actual DOM node exactly as it did on the old `Card`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 3: Manual verification**

`npm run dev`, go to `/logbook`, confirm each tile in the "cards grid" still glows in *that tile's own app color* (e.g. the MoneyLog tile green, the SocialLog tile magenta) rather than LogBook's indigo, and that tapping a tile still switches apps via the existing app-switch loader.

- [ ] **Step 4: Commit**

```bash
git add components/logbook/LogCardsGrid.tsx
git commit -m "feat(logbook): restyle LogCardsGrid tiles with per-app StatCard colors"
```

---

### Task 4: MoneyLog — NetSummaryCard, NetWorthCard, DualRingCard wrapper

**Files:**
- Modify: `app/(moneylog)/moneylog/_components/NetSummaryCard.tsx`
- Modify: `app/(moneylog)/moneylog/_components/NetWorthCard.tsx`
- Modify: `app/(moneylog)/moneylog/page.tsx` (the `Card`/`CardContent` wrapper around `DualRingCard`)

**Interfaces:**
- Consumes: `StatCard` from Task 1.

- [ ] **Step 1: Convert `NetSummaryCard.tsx`**

Replace the full contents of `app/(moneylog)/moneylog/_components/NetSummaryCard.tsx`:

```tsx
// app/(moneylog)/moneylog/_components/NetSummaryCard.tsx
'use client';

import { TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

interface NetSummaryCardProps {
  income: number;
  expense: number;
}

export function NetSummaryCard({ income, expense }: NetSummaryCardProps) {
  const net = income - expense;
  return (
    <StatCard title="Net Balance" icon={Scale}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            Income
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(income)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            Expense
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(expense)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-muted-foreground">Net</span>
          <p className={cn('font-semibold tabular-nums', net >= 0 ? 'text-emerald-500' : 'text-destructive')}>
            {formatCurrency(net)}
          </p>
        </div>
      </div>
    </StatCard>
  );
}
```

- [ ] **Step 2: Convert `NetWorthCard.tsx`**

Replace the full contents of `app/(moneylog)/moneylog/_components/NetWorthCard.tsx`:

```tsx
// app/(moneylog)/moneylog/_components/NetWorthCard.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { apiFetch } from '@/lib/apiFetch';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load net worth');
  return res.json();
}

export function NetWorthCard() {
  const { data } = useSWR<{ netWorth: number }>('/api/moneylog/assets', fetcher);

  return (
    <Link href="/moneylog/assets">
      <StatCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Net Worth</p>
              <p className={cn('text-lg font-semibold tabular-nums', (data?.netWorth ?? 0) < 0 && 'text-destructive')}>
                {data ? formatCurrency(data.netWorth) : '—'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </StatCard>
    </Link>
  );
}
```

- [ ] **Step 3: Swap the `DualRingCard` wrapper in `page.tsx`**

`DualRingCard` itself is a richer multi-segment visualization (two concentric
rings with per-category legends) than a single-value `StatRing` — it stays
exactly as-is internally. Only its outer wrapper changes. In
`app/(moneylog)/moneylog/page.tsx`, find:

```tsx
      <Card>
        <CardContent className="pt-6">
          <DualRingCard
            subtitle={periodLabel}
            incomeSegments={toSegments(data.incomeByCategory, INCOME_RING_COLORS)}
            incomeTotal={data.totalIncome}
            expenseSegments={toSegments(data.expenseByCategory, EXPENSE_RING_COLORS)}
            expenseTotal={data.totalExpense}
          />
        </CardContent>
      </Card>
```

Replace with:

```tsx
      <StatCard>
        <DualRingCard
          subtitle={periodLabel}
          incomeSegments={toSegments(data.incomeByCategory, INCOME_RING_COLORS)}
          incomeTotal={data.totalIncome}
          expenseSegments={toSegments(data.expenseByCategory, EXPENSE_RING_COLORS)}
          expenseTotal={data.totalExpense}
        />
      </StatCard>
```

Add `import { StatCard } from '@/components/ui/stat-card';` near the other
component imports. Leave the other `<Card>` usages in this file (e.g. the
loading skeleton, `GetStartedCard`) untouched — only this one wraps a
stat/KPI visualization.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 5: Manual verification**

`npm run dev`, go to `/moneylog`, confirm `NetSummaryCard`, `NetWorthCard`, and the income/expense ring card all show a green neon border (MoneyLog's `--primary`), and the dual-ring visualization itself is pixel-identical to before (only its border changed).

- [ ] **Step 6: Commit**

```bash
git add "app/(moneylog)/moneylog/_components/NetSummaryCard.tsx" "app/(moneylog)/moneylog/_components/NetWorthCard.tsx" "app/(moneylog)/moneylog/page.tsx"
git commit -m "feat(moneylog): restyle NetSummaryCard, NetWorthCard, and DualRingCard wrapper with StatCard"
```

---

### Task 5: MoneyLog — FinancialGoalsList

**Files:**
- Modify: `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx`

**Interfaces:**
- Consumes: `StatCard`, `StatRing` from Task 1.

- [ ] **Step 1: Swap `Card` + `AnimatedCircularProgressBar` for `StatCard` + `StatRing`**

In `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx`, change the import block from:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
```

to:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { StatRing } from '@/components/ui/stat-ring';
```

(`Card`/`CardHeader`/`CardTitle`/`CardContent` stay imported — the "No financial goals yet" empty state a few lines down still uses them and is not a stat widget.)

Then find the full per-goal render (the `return` immediately after
`const progress = computeGoalProgress(...)`):

```tsx
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
                  {formatCurrency(progress.current)} / {formatCurrency(progress.target)}
                </p>
              </div>
            </CardContent>
          </Card>
        );
```

Replace with:

```tsx
        return (
          <StatCard key={goal.id} title={goal.label}>
            <div className="flex items-center gap-4">
              <StatRing value={progress.pct} size="sm" className="text-sm" />
              <div>
                <p className="text-sm text-muted-foreground">{goalTypeLabel(goal.goalType)}</p>
                {goal.category && <p className="text-xs text-muted-foreground">{categoryLabel(goal.category)}</p>}
                <p className="font-semibold">
                  {formatCurrency(progress.current)} / {formatCurrency(progress.target)}
                </p>
              </div>
            </div>
          </StatCard>
        );
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 3: Manual verification**

`npm run dev`, go to `/moneylog/goals`, confirm each goal card shows a green-glowing neon border with its ring intact, and the "No financial goals yet" empty state (if you have no goals) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add "app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx"
git commit -m "feat(moneylog): restyle FinancialGoalsList with StatCard/StatRing"
```

---

### Task 6: TaskLog — streak row and GoalCard

**Files:**
- Modify: `app/(tasklog)/tasklog/page.tsx` (the streak row, currently a bare `div`, not a `Card` — find it by its `FlameIcon` usage)
- Modify: `app/(tasklog)/tasklog/goals/_components/GoalCard.tsx`

**Interfaces:**
- Consumes: `StatCard`, `StatRing` from Task 1.

- [ ] **Step 1: Convert the TaskLog home streak row to a `StatCard`**

In `app/(tasklog)/tasklog/page.tsx`, find:

```tsx
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <FlameIcon className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">{Number(profile?.taskLogCurrentStreak ?? 0)} day streak</p>
            <p className="text-xs text-muted-foreground">Best: {Number(profile?.taskLogLongestStreak ?? 0)}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{doneCount}/{tasks.length} done today</p>
      </div>
```

Replace with:

```tsx
      <div className="px-4 py-3">
        <StatCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlameIcon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{Number(profile?.taskLogCurrentStreak ?? 0)} day streak</p>
                <p className="text-xs text-muted-foreground">Best: {Number(profile?.taskLogLongestStreak ?? 0)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{doneCount}/{tasks.length} done today</p>
          </div>
        </StatCard>
      </div>
```

Add `import { StatCard } from '@/components/ui/stat-card';` near the other
component imports at the top of the file.

- [ ] **Step 2: Convert `GoalCard.tsx`'s linear progress bar to a `StatRing`**

In `app/(tasklog)/tasklog/goals/_components/GoalCard.tsx`, change the import:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

to:

```tsx
import { StatCard } from '@/components/ui/stat-card';
import { StatRing } from '@/components/ui/stat-ring';
```

Then replace the full `return`:

```tsx
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{goal.title}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal capitalize">{goal.category}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
        {total > 0 && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{completed}/{total} tasks done</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Thinking…' : total > 0 ? 'Regenerate tasks' : 'Generate tasks'}
        </Button>
      </CardContent>
      <BreakdownReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        suggestions={suggestions}
        onConfirm={handleConfirm}
      />
    </Card>
  );
```

with:

```tsx
  return (
    <StatCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          {goal.title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal capitalize">{goal.category}</span>
        </span>
      }
    >
      <div className="space-y-3">
        {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
        {total > 0 && (
          <div className="flex items-center gap-3">
            <StatRing value={pct} size="sm" className="text-xs" />
            <p className="text-xs text-muted-foreground">{completed}/{total} tasks done</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Thinking…' : total > 0 ? 'Regenerate tasks' : 'Generate tasks'}
        </Button>
      </div>
      <BreakdownReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        suggestions={suggestions}
        onConfirm={handleConfirm}
      />
    </StatCard>
  );
```

`Button` and `BreakdownReviewSheet` imports stay as they were — only the
`Card` import is being swapped.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 4: Manual verification**

`npm run dev`, go to `/tasklog`, confirm the streak row now sits inside a blue-glowing neon card. Go to `/tasklog/goals`, confirm each goal with linked tasks shows a small ring instead of the old linear bar, still at the correct percentage.

- [ ] **Step 5: Commit**

```bash
git add "app/(tasklog)/tasklog/page.tsx" "app/(tasklog)/tasklog/goals/_components/GoalCard.tsx"
git commit -m "feat(tasklog): restyle streak row and GoalCard with StatCard/StatRing"
```

---

### Task 7: TravelLog — split the 3-stat card into individual StatCards

**Files:**
- Modify: `app/(travellog)/travellog/page.tsx`

**Interfaces:**
- Consumes: `StatCard` from Task 1.

- [ ] **Step 1: Replace the single 3-column `Card` with three `StatCard`s**

In `app/(travellog)/travellog/page.tsx`, change the import:

```tsx
import { Card, CardContent } from '@/components/ui/card';
```

to:

```tsx
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
```

(`Card`/`CardContent` stay imported — the loading skeleton and the
zero-visits empty-state card below both still use them.)

Then replace:

```tsx
        {loading ? (
          <Card>
            <CardContent className="pt-6 grid grid-cols-3 gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold">{totalVisits}</p>
                <p className="text-xs text-muted-foreground">Visits</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{countries}</p>
                <p className="text-xs text-muted-foreground">Countries</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{exploredCount}</p>
                <p className="text-xs text-muted-foreground">Explored</p>
              </div>
            </CardContent>
          </Card>
        )}
```

with:

```tsx
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{totalVisits}</p>
              <p className="text-xs text-muted-foreground">Visits</p>
            </StatCard>
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{countries}</p>
              <p className="text-xs text-muted-foreground">Countries</p>
            </StatCard>
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{exploredCount}</p>
              <p className="text-xs text-muted-foreground">Explored</p>
            </StatCard>
          </div>
        )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 3: Manual verification**

`npm run dev`, go to `/travellog`, confirm the three stats each render in their own neon-orange-glowing (TravelLog's `--primary`) card side by side, and the "no trips logged yet" empty state below is unchanged.

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/travellog/page.tsx"
git commit -m "feat(travellog): split home stats into individual StatCards"
```

---

### Task 8: HomeLog — new "Chores due today" and "Your balance" widgets

**Files:**
- Modify: `app/(homelog)/homelog/page.tsx`

**Interfaces:**
- Consumes: `StatCard` from Task 1, the existing `/api/homelog/chores` GET (already returns each active chore with its open, uncompleted `instance.dueDate`) and `/api/homelog/balances` GET (already returns pairwise `{ memberA, memberB, net }` balances — `net > 0` means `memberA` owes `memberB`, per `lib/homelog/expenseBalances.ts`'s documented convention).
- Produces: nothing new consumed elsewhere — this is a leaf page.

No new backend routes are needed — both metrics are derived client-side
from data these two endpoints already return.

- [ ] **Step 1: Add the two new stat fetches and widgets**

In `app/(homelog)/homelog/page.tsx`, add these imports alongside the existing ones:

```tsx
import { StatCard } from '@/components/ui/stat-card';
import { ListTodo, Scale } from 'lucide-react';
```

Add these two types and fetchers near the existing `PendingInvite`/`fetchPendingInvites`:

```tsx
interface ChoreWithInstance {
  id: string;
  instance: { dueDate: string } | null;
}

interface BalanceRow {
  memberA: string;
  memberB: string;
  net: number;
}

async function fetchChoresForStats(): Promise<ChoreWithInstance[]> {
  const res = await fetch('/api/homelog/chores');
  const body = await res.json();
  return body.chores ?? [];
}

async function fetchBalancesForStats(): Promise<BalanceRow[]> {
  const res = await fetch('/api/homelog/balances');
  const body = await res.json();
  return body.balances ?? [];
}
```

Inside `HomeLogPage`, alongside the existing `useSWR` calls, add:

```tsx
  const { data: choresForStats } = useSWR(household ? 'homelog-chores' : null, fetchChoresForStats);
  const { data: balancesForStats } = useSWR(
    household ? 'homelog-balances' : null,
    fetchBalancesForStats
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const choresDueToday = (choresForStats ?? []).filter((c) => c.instance?.dueDate === todayStr).length;
  const myNetBalance = (balancesForStats ?? []).reduce((sum, b) => {
    if (b.memberA === profile?.id) return sum - b.net;
    if (b.memberB === profile?.id) return sum + b.net;
    return sum;
  }, 0);
```

(Both `useSWR` keys — `'homelog-chores'` and `'homelog-balances'` — match
the SWR cache keys the Chores and Bills pages already use for the same
endpoints, so navigating between Home/Chores/Bills reuses the cache instead
of re-fetching.)

Then, inside the `household &&` branch (the `<>...</>` block rendered once
a household exists), add the two `StatCard`s right after the opening `<>`,
before the household-name `Card`:

```tsx
            <div className="grid grid-cols-2 gap-3">
              <StatCard title="Chores due today" icon={ListTodo}>
                <p className="text-2xl font-bold">{choresDueToday}</p>
              </StatCard>
              <StatCard title="Your balance" icon={Scale}>
                <p className={cn('text-2xl font-bold', myNetBalance < 0 ? 'text-destructive' : 'text-emerald-500')}>
                  {myNetBalance === 0 ? 'Settled up' : `${myNetBalance > 0 ? '+' : ''}${myNetBalance.toFixed(2)}`}
                </p>
              </StatCard>
            </div>
```

This needs `cn` from `@/lib/utils` — add
`import { cn } from '@/lib/utils';` if not already imported in this file
(it currently isn't — check with `grep -n "^import" "app/(homelog)/homelog/page.tsx"` before adding, to avoid a duplicate).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 3: Manual verification**

`npm run dev`, go to `/homelog` with an existing household that has at least one chore due today and at least one unsettled expense split with another member — confirm "Chores due today" shows the right count and "Your balance" shows the right signed amount (compare against what the Bills page's "Balances" card says: if Bills says "You owe X", this card should show a negative number close to `-X`; if it says "Y owes you", it should be positive `+Y`).

- [ ] **Step 4: Commit**

```bash
git add "app/(homelog)/homelog/page.tsx"
git commit -m "feat(homelog): add Chores due today and Your balance stat widgets"
```

---

### Task 9: SocialLog — new "Followers" and "Posts" widgets

**Files:**
- Create: `app/api/sociallog/stats/route.ts`
- Modify: `app/(sociallog)/sociallog/page.tsx`

**Interfaces:**
- Produces: `GET /api/sociallog/stats` → `{ followers: number, posts: number }`.
- Consumes: `StatCard` from Task 1.

- [ ] **Step 1: Create the stats API route**

```ts
// app/api/sociallog/stats/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [followersRes, postsRes] = await Promise.all([
      admin.from('social_follows').select('id', { count: 'exact', head: true }).eq('followingId', meId),
      admin.from('social_posts').select('id', { count: 'exact', head: true }).eq('profileId', meId),
    ]);

    return NextResponse.json({
      followers: followersRes.count ?? 0,
      posts: postsRes.count ?? 0,
    });
  } catch (error) {
    console.error('sociallog stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Wire the new widgets into the SocialLog home page**

In `app/(sociallog)/sociallog/page.tsx`, add these imports:

```tsx
import { StatCard } from '@/components/ui/stat-card';
import { Users, FileText } from 'lucide-react';
```

Add a new `useSWR` call alongside the existing feed one:

```tsx
  const { data: stats } = useSWR<{ followers: number; posts: number }>(
    profile ? '/api/sociallog/stats' : null,
    fetcher
  );
```

Then, right after `<ComposeBox onPosted={() => mutate()} />` in the JSX, add:

```tsx
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Followers" icon={Users}>
            <p className="text-2xl font-bold">{stats?.followers ?? 0}</p>
          </StatCard>
          <StatCard title="Posts" icon={FileText}>
            <p className="text-2xl font-bold">{stats?.posts ?? 0}</p>
          </StatCard>
        </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 4: Manual verification**

`npm run dev`, go to `/sociallog`, confirm two magenta/pink-glowing (SocialLog's `--primary`) stat cards render above the feed showing your follower and post counts. Cross-check the post count against how many posts you can see under your own profile/search.

- [ ] **Step 5: Commit**

```bash
git add app/api/sociallog/stats/route.ts "app/(sociallog)/sociallog/page.tsx"
git commit -m "feat(sociallog): add Followers and Posts stat widgets"
```

---

### Task 10: ShoppingLog — new "Active listings" and "Orders this month" widgets

**Files:**
- Create: `app/api/shoppinglog/stats/route.ts`
- Modify: `app/(shoppinglog)/shoppinglog/page.tsx`

**Interfaces:**
- Produces: `GET /api/shoppinglog/stats` → `{ activeListings: number, ordersThisMonth: number }`.
- Consumes: `StatCard` from Task 1.

- [ ] **Step 1: Create the stats API route**

```ts
// app/api/shoppinglog/stats/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [listingsRes, buyerOrdersRes, sellerOrdersRes] = await Promise.all([
      admin
        .from('shop_listings')
        .select('id', { count: 'exact', head: true })
        .eq('sellerId', meId)
        .eq('status', 'active'),
      admin
        .from('shop_orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyerId', meId)
        .gte('createdAt', monthStart),
      admin
        .from('shop_orders')
        .select('id', { count: 'exact', head: true })
        .eq('sellerId', meId)
        .gte('createdAt', monthStart),
    ]);

    return NextResponse.json({
      activeListings: listingsRes.count ?? 0,
      ordersThisMonth: (buyerOrdersRes.count ?? 0) + (sellerOrdersRes.count ?? 0),
    });
  } catch (error) {
    console.error('shoppinglog stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

(Two separate `buyerId`/`sellerId` counts, summed, rather than one
`buyerId.eq.X,sellerId.eq.X` OR-filter — this avoids double-counting a
theoretical self-purchase and matches the existing orders route's pattern
of running buyer and seller queries separately.)

- [ ] **Step 2: Wire the new widgets into the ShoppingLog home page**

In `app/(shoppinglog)/shoppinglog/page.tsx`, add these imports:

```tsx
import { StatCard } from '@/components/ui/stat-card';
import { Store, Package } from 'lucide-react';
```

Add a new `useSWR` call alongside the existing ones:

```tsx
  const { data: stats } = useSWR<{ activeListings: number; ordersThisMonth: number }>(
    '/api/shoppinglog/stats',
    fetcher
  );
```

Then, right after the opening `<main className="flex-1 container mx-auto max-w-4xl space-y-4 p-4 pb-24">`, before the search `Label`/`Input`, add:

```tsx
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Active listings" icon={Store}>
            <p className="text-2xl font-bold">{stats?.activeListings ?? 0}</p>
          </StatCard>
          <StatCard title="Orders this month" icon={Package}>
            <p className="text-2xl font-bold">{stats?.ordersThisMonth ?? 0}</p>
          </StatCard>
        </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 4: Manual verification**

`npm run dev`, go to `/shoppinglog`, confirm two orange-glowing (ShoppingLog's `--primary`) stat cards render above the search bar. Create a listing via `/shoppinglog/sell` and confirm "Active listings" increments; place or receive an order and confirm "Orders this month" increments.

- [ ] **Step 5: Commit**

```bash
git add app/api/shoppinglog/stats/route.ts "app/(shoppinglog)/shoppinglog/page.tsx"
git commit -m "feat(shoppinglog): add Active listings and Orders this month stat widgets"
```
