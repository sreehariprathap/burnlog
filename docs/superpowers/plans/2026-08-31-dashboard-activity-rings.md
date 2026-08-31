# Dashboard Activity Rings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, linearly (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BurnLog dashboard's tab/carousel "Today's Activity" widget with a single card showing all four metrics (Burn, Eat, Move, Steps) as concentric rings plus a legend.

**Architecture:** `DailyRingsWidget.tsx` keeps its existing data layer (`RINGS` config, `fetchData`, `goals`/`metrics` state) untouched and only changes the render — stacked `AnimatedCircularProgressBar` instances instead of `SmoothTabs`/`MotionCarousel`. `AnimatedCircularProgressBar` gets one new optional `showValue` prop (default `true`, non-breaking) to suppress its center number when stacked.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind (`tailwind-merge` via `cn()` for class overrides), `lucide-react`, existing `components/ui/card.tsx`/`skeleton.tsx`.

## Global Constraints

- No test framework exists in this repo. Verification is `npx tsc --noEmit` + manual in-browser checks.
- Do not change `RINGS` config, colors, data-fetching, or targets — reuse exactly as-is.
- `AnimatedCircularProgressBar`'s new prop must default to preserving current behavior for its other three callers (`GoalProgressWidget.tsx`, `FinancialGoalsList.tsx`, `components/logbook/DayScoreRing.tsx`) — do not touch those files.
- `DailyRingsWidget` is used in two places (`app/(burnlog)/dashboard/page.tsx:208` and `app/(burnlog)/session/page.tsx:259`) with identical props (`profileId`, `refreshKey`) — its public props must not change.

---

### Task 1: Add `showValue` to `AnimatedCircularProgressBar`

**Files:**
- Modify: `components/ui/animated-circular-progress-bar.tsx`

**Interfaces:**
- Produces: `AnimatedCircularProgressBarProps` gains `showValue?: boolean` (default `true`), consumed by Task 2.

- [ ] **Step 1: Add the prop and conditionally render the center label**

In `components/ui/animated-circular-progress-bar.tsx`, change the props interface (currently lines 3-10):

```ts
interface AnimatedCircularProgressBarProps {
  max?: number
  min?: number
  value: number
  gaugePrimaryColor: string
  gaugeSecondaryColor: string
  className?: string
  showValue?: boolean
}
```

Change the function signature (currently lines 12-19):

```ts
export function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value = 0,
  gaugePrimaryColor,
  gaugeSecondaryColor,
  className,
  showValue = true,
}: AnimatedCircularProgressBarProps) {
```

Wrap the existing center `<span>` (currently lines 100-105) in the new condition — replace:

```tsx
      <span
        data-current-value={currentPercent}
        className="animate-in fade-in absolute inset-0 m-auto size-fit delay-(--delay) duration-(--transition-length) ease-linear"
      >
        {currentPercent}
      </span>
```

with:

```tsx
      {showValue && (
        <span
          data-current-value={currentPercent}
          className="animate-in fade-in absolute inset-0 m-auto size-fit delay-(--delay) duration-(--transition-length) ease-linear"
        >
          {currentPercent}
        </span>
      )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `animated-circular-progress-bar.tsx` or its three other callers.

- [ ] **Step 3: Commit**

```bash
git add components/ui/animated-circular-progress-bar.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add optional showValue prop to AnimatedCircularProgressBar

Defaults to true (unchanged behavior for existing callers); lets
stacked/concentric ring layouts suppress the center number.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rebuild `DailyRingsWidget` as stacked rings + legend

**Files:**
- Modify: `app/(burnlog)/dashboard/_components/DailyRingsWidget.tsx`

**Interfaces:**
- Consumes: `showValue` prop from Task 1.
- Produces: `DailyRingsWidget({ profileId, refreshKey }: { profileId: string; refreshKey: number })` — unchanged public signature, used by `app/(burnlog)/dashboard/page.tsx:208` and `app/(burnlog)/session/page.tsx:259`.

- [ ] **Step 1: Replace the full contents of `app/(burnlog)/dashboard/_components/DailyRingsWidget.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Flame, Utensils, Timer, Footprints } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveTarget, getTodayRange } from '@/lib/dailyTargets';
import { formatCalories } from '@/lib/format';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

const RINGS = [
  { key: 'burn' as const, goalType: 'calories_burned', color: '#F97316', secondaryColor: 'rgba(249, 115, 22, 0.15)', icon: Flame, label: 'Burn', unit: 'kcal', ringSize: 'size-48' },
  { key: 'eat' as const, goalType: 'calories_intake', color: '#22C55E', secondaryColor: 'rgba(34, 197, 94, 0.15)', icon: Utensils, label: 'Eat', unit: 'kcal', ringSize: 'size-40' },
  { key: 'workoutMinutes' as const, goalType: 'workout_time', color: '#3B82F6', secondaryColor: 'rgba(59, 130, 246, 0.15)', icon: Timer, label: 'Move', unit: 'min', ringSize: 'size-32' },
  { key: 'steps' as const, goalType: 'daily_steps', color: '#A855F7', secondaryColor: 'rgba(168, 85, 247, 0.15)', icon: Footprints, label: 'Steps', unit: 'steps', ringSize: 'size-24' },
];

type DailyRingsWidgetProps = {
  profileId: string;
  refreshKey: number;
};

export function DailyRingsWidget({ profileId, refreshKey }: DailyRingsWidgetProps) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ burn: 0, eat: 0, workoutMinutes: 0, steps: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getTodayRange();

      const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
        supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
        supabase
          .from('calorie_burns')
          .select('caloriesBurned, duration')
          .eq('profileId', profileId)
          .gte('date', start)
          .lt('date', end),
        supabase.from('food_intakes').select('calories').eq('profileId', profileId).gte('date', start).lt('date', end),
        supabase.from('step_entries').select('steps').eq('profileId', profileId).gte('date', start).lt('date', end),
      ]);

      setGoals((goalsRes.data as Goal[]) || []);

      const burnRows = (burnRes.data as { caloriesBurned: number; duration: number }[]) || [];
      const eatRows = (eatRes.data as { calories: number }[]) || [];
      const stepRows = (stepsRes.data as { steps: number }[]) || [];

      setMetrics({
        burn: burnRows.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0),
        eat: eatRows.reduce((sum, r) => sum + (r.calories || 0), 0),
        workoutMinutes: burnRows.reduce((sum, r) => sum + (r.duration || 0), 0),
        steps: stepRows.reduce((sum, r) => sum + (r.steps || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching daily rings data:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <Skeleton className="h-48 w-48 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const values: Record<string, number> = {
    burn: metrics.burn,
    eat: metrics.eat,
    workoutMinutes: metrics.workoutMinutes,
    steps: metrics.steps,
  };

  const rows = RINGS.map((ring) => {
    const target = resolveTarget(goals, ring.goalType);
    const value = values[ring.key];
    const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const current = Math.round(value);
    return { ring, target, current, pct };
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-5">
          <span className="font-semibold">Today&apos;s Activity</span>

          <div className="relative mx-auto size-48">
            {rows.map(({ ring, pct }) => (
              <AnimatedCircularProgressBar
                key={ring.key}
                value={pct}
                min={0}
                max={100}
                gaugePrimaryColor={ring.color}
                gaugeSecondaryColor={ring.secondaryColor}
                showValue={false}
                className={`absolute inset-0 m-auto ${ring.ringSize} text-transparent`}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            {rows.map(({ ring, target, current }) => {
              const Icon = ring.icon;
              return (
                <div key={ring.key} className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" style={{ color: ring.color }} />
                  <span className="text-sm font-medium">{ring.label}</span>
                  <span className="ml-auto text-sm">
                    {ring.unit === 'kcal' ? (
                      <>
                        <span className="font-medium tabular-nums">{formatCalories(current)}</span>
                        <span className="text-muted-foreground"> / {formatCalories(target)}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium tabular-nums">{current.toLocaleString()}</span>
                        <span className="text-muted-foreground"> / {target.toLocaleString()} {ring.unit}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

Note: `text-transparent` on each stacked ring's `className` neutralizes the `text-2xl font-semibold` base classes' visual text color from `AnimatedCircularProgressBar`'s root `div` (harmless now that `showValue={false}` removes the `<span>` entirely, but kept for defensiveness against any future text rendered by that root).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `DailyRingsWidget.tsx`. Confirm no remaining imports of `SmoothTabs`/`MotionCarousel`/`TabItem` in this file (they're removed, not just unused).

- [ ] **Step 3: Manual verification in the browser**

Start the dev server (`npm run dev`) if not already running, then:
1. Navigate to `/dashboard`. Confirm "Today's Activity" is now one card with four concentric rings (Burn outermost/orange, Eat/green, Move/blue, Steps innermost/purple) and no tab icons or swipeable carousel.
2. Confirm the legend below lists all four rows simultaneously: Burn, Eat, Move, Steps, each with icon, label, and `current / target` text matching the values previously shown per-tab.
3. Log a workout via the dashboard's quick-log FAB, confirm the Burn ring's fill percentage and legend value update after save (data layer unchanged, so this should already work).
4. Navigate to `/session` and confirm the same widget renders correctly there too (it's reused on that page).

Expected: single unified card, all four rings visible at once, legend values correct, no console errors, no leftover swipe/tab UI.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/dashboard/_components/DailyRingsWidget.tsx"
git commit -m "$(cat <<'EOF'
feat(dashboard): unify Today's Activity into concentric rings + legend

Replaces the tab/carousel single-ring-at-a-time view with one card
showing Burn/Eat/Move/Steps as stacked concentric rings plus a
legend listing all four current/target values at once.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** Design spec's approach section — drop tabs/carousel, stack rings outside-in Burn→Eat→Move→Steps, legend below, `showValue` prop non-breaking — is fully covered by Task 1 (prop) and Task 2 (render rebuild). Out-of-scope items (color/target/data changes, tappable rows) are not touched.
- **Placeholder scan:** none — both tasks give complete file contents/exact diffs.
- **Type consistency:** `showValue` prop name and default match between Task 1's interface and Task 2's usage (`showValue={false}`). `DailyRingsWidgetProps` unchanged, matching both existing call sites.
