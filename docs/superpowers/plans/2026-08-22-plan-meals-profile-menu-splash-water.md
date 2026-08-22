# Plan Meals/Rollup, Profile Dropdown, Weekday Tabs, Splash Screen, Water Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six independent additions: (1-3) a water intake tracker (new table, dashboard + Plan-page widget, profile settings), (4) daily meal/goal rings embedded in the Plan page's Day view, (5) a monthly activity rollup in the Plan page's Month view, (6) a Profile dropdown menu replacing the direct bottom-nav link, (7) an animated weekday tab bar replacing the plain `DayNavigator`, and (8) theme-specific animated splash screen backgrounds.

**Architecture:** Mostly additive UI + one new table. Water intake is a single upserted-per-day row per profile (`water_entries`), read/written from two independent widgets that both key off the same `(profileId, today)` row. The daily-rings and monthly-rollup additions reuse/extend existing dashboard patterns rather than inventing new ones. The Profile dropdown and weekday tabs both follow the `layoutId`-based sliding-highlight pattern already established by `SmoothTabs`/`BottomNav`'s active-tab indicator, applied to two new, purpose-specific components.

**Tech Stack:** Next.js client components, `@supabase/auth-helpers-nextjs`, Prisma, `motion/react`, `lucide-react`, `@radix-ui/react-dropdown-menu` (new dependency), Tailwind CSS, HTML5 Canvas.

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing via Chrome DevTools MCP (`http://127.0.0.1:3000` or whichever dev port is running, test account `push-verify@example.com` / `PushVerify123!`).
- Schema changes via `npx prisma db push` (no migrations directory). RLS applied via `mcp__supabase__execute_sql`, then mirrored into `supabase/rls.sql`.
- The dark-mode splash-screen "shader" effect is a from-scratch canvas implementation in the visual spirit of Aceternity's "Lines Gradient" shader, not a ported copy — no exact source was available.
- All new/changed colors use the app's existing brand palette (`#FF9E4F`, `#F97316`, `#EF4444`, `#B55233`, and the `--chart-1..5` theme tokens) — no arbitrary/rainbow palettes, consistent with prior feedback this session.
- `components/kokonutui/background-paths.tsx` has no call site outside `SplashScreen.tsx` (confirmed via grep) — it must be deleted, not left as dead code, once `SplashScreen` stops using it.
- `app/session/_components/DayNavigator.tsx` has no call site outside `app/session/page.tsx` (confirmed via grep; the one other reference, in `AddWorkoutModal.tsx`, is a code comment, not an import) — it must be deleted, not left as dead code, once `page.tsx` stops using it.

---

### Task 1: Water tracker schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Produces: `WaterEntry { id, profileId, date, amountMl }` (table `water_entries`, unique on `(profileId, date)`). `Profile.waterUnit String @default("glasses")`, `Profile.glassSizeMl Int @default(250)`, `Profile.waterGoalMl Int @default(2000)`.

- [ ] **Step 1: Add the schema**

In `prisma/schema.prisma`, add to the `Profile` model (after `lastConsistencyBonusWeek`):
```prisma
  waterUnit                String    @default("glasses")
  glassSizeMl              Int       @default(250)
  waterGoalMl              Int       @default(2000)
```

Add `WaterEntry   WaterEntry[]` to `Profile`'s relations list (alongside the existing `StepEntry StepEntry[]` line).

Add a new model (after the `StepEntry` model):
```prisma
/// daily water intake tracking (one row per profile per day)
model WaterEntry {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id])
  profileId String   @db.Uuid
  date      DateTime @db.Date
  amountMl  Int      @default(0)

  @@unique([profileId, date])
  @@map("water_entries")
}
```

- [ ] **Step 2: Push the schema**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Add RLS for the new table**

Using `mcp__supabase__execute_sql`:
```sql
alter table water_entries enable row level security;

create policy "water_entries_owner_access" on water_entries
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = water_entries."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = water_entries."profileId"
        and profiles."userId" = auth.uid()
    )
  );
```

- [ ] **Step 4: Mirror into `supabase/rls.sql`**

Add `'water_entries'` to the existing table-name array in the `do $$ ... end $$` block (the one currently listing `'fitness_goals', 'workouts', 'workout_plans', 'sessions', 'weight_entries', 'calorie_burns', 'food_intakes', 'stamina_sessions', 'step_entries'`), so a fresh database created from this file gets the policy automatically. **Do not** re-run the whole `do $$` block against the live database (Step 3 already created the policy directly; re-running the loop would fail with "policy already exists" for every table already covered) — this edit is for the version-controlled file only.

- [ ] **Step 5: Verify**

Using `mcp__supabase__execute_sql`:
```sql
select policyname from pg_policies where tablename = 'water_entries';
```
Expected: one row, `water_entries_owner_access`.

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add water_entries table and Profile water-tracking fields"
```

---

### Task 2: `WaterIntakeTracker` component + Dashboard wiring

**Files:**
- Create: `components/kokonutui/water-intake-tracker.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Produces: `WaterIntakeTracker({ profileId, waterUnit, glassSizeMl, waterGoalMl }: WaterIntakeTrackerProps)` where `WaterIntakeTrackerProps = { profileId: string; waterUnit: 'glasses' | 'liters'; glassSizeMl: number; waterGoalMl: number }`.
- Consumes: `toLocalDateString` from `@/lib/date` (already exists).

- [ ] **Step 1: Write `WaterIntakeTracker`**

```tsx
// components/kokonutui/water-intake-tracker.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { GlassWater, Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toLocalDateString } from '@/lib/date';

type WaterIntakeTrackerProps = {
  profileId: string;
  waterUnit: 'glasses' | 'liters';
  glassSizeMl: number;
  waterGoalMl: number;
};

const MAX_ML = 5000;
const STEP_ML = 250;
const MAX_ICONS = 8;

export function WaterIntakeTracker({ profileId, waterUnit, glassSizeMl, waterGoalMl }: WaterIntakeTrackerProps) {
  const supabase = createClientComponentClient();
  const prefersReducedMotion = useReducedMotion();
  const [amountMl, setAmountMl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = toLocalDateString(new Date());
      const { data } = await supabase
        .from('water_entries')
        .select('amountMl')
        .eq('profileId', profileId)
        .eq('date', today)
        .maybeSingle();
      if (!cancelled) {
        setAmountMl(data?.amountMl ?? 0);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId]);

  const step = waterUnit === 'glasses' ? glassSizeMl : STEP_ML;

  const persist = async (next: number) => {
    const today = toLocalDateString(new Date());
    setAmountMl(next);
    await supabase
      .from('water_entries')
      .upsert({ profileId, date: today, amountMl: next }, { onConflict: 'profileId,date' });
  };

  const handleChange = (delta: number) => {
    const next = amountMl + delta;
    if (next < 0 || next > MAX_ML) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    persist(next);
  };

  const displayValue =
    waterUnit === 'liters' ? (amountMl / 1000).toFixed(2) : String(Math.round(amountMl / glassSizeMl));
  const unitLabel =
    waterUnit === 'liters' ? 'L' : Math.round(amountMl / glassSizeMl) === 1 ? 'glass' : 'glasses';
  const goalDisplay =
    waterUnit === 'liters' ? (waterGoalMl / 1000).toFixed(1) : String(Math.round(waterGoalMl / glassSizeMl));
  const filledIcons = Math.min(Math.round(amountMl / glassSizeMl), MAX_ICONS);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GlassWater className="size-4 text-sky-500" />
          Water Intake
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: MAX_ICONS }).map((_, i) => (
                <GlassWater
                  key={i}
                  className={cn('size-4 transition-colors', i < filledIcons ? 'text-sky-500' : 'text-muted-foreground/25')}
                />
              ))}
            </div>

            <motion.div
              animate={shake && !prefersReducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-4"
            >
              <button
                type="button"
                onClick={() => handleChange(-step)}
                aria-label="Remove water"
                className="flex size-9 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted"
              >
                <Minus className="size-4" />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={displayValue}
                  initial={prefersReducedMotion ? undefined : { y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={prefersReducedMotion ? undefined : { y: -8, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-20 text-center"
                >
                  <div className="text-2xl font-bold">{displayValue}</div>
                  <div className="text-xs text-muted-foreground">{unitLabel}</div>
                </motion.div>
              </AnimatePresence>

              <button
                type="button"
                onClick={() => handleChange(step)}
                aria-label="Add water"
                className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" />
              </button>
            </motion.div>

            <p className="text-xs text-muted-foreground">
              Goal: {goalDisplay} {waterUnit === 'liters' ? 'L' : 'glasses'}/day
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into the Dashboard**

In `app/dashboard/page.tsx`, add the import (after the `DailyRingsWidget` import):
```tsx
import { WaterIntakeTracker } from '@/components/kokonutui/water-intake-tracker';
```

Change the profile select query — add the three new fields:
```tsx
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
```
This already selects `*`, so no change is needed here — `profile.waterUnit`, `profile.glassSizeMl`, `profile.waterGoalMl` are already present on `userProfile` once fetched.

Add the widget right after the Daily Rings block:
```tsx
        {/* Daily Rings */}
        {userProfile && (
          <DailyRingsWidget profileId={userProfile.id} refreshKey={refreshKey} />
        )}
```
becomes:
```tsx
        {/* Daily Rings */}
        {userProfile && (
          <DailyRingsWidget profileId={userProfile.id} refreshKey={refreshKey} />
        )}

        {/* Water Intake */}
        {userProfile && (
          <WaterIntakeTracker
            profileId={userProfile.id}
            waterUnit={userProfile.waterUnit}
            glassSizeMl={userProfile.glassSizeMl}
            waterGoalMl={userProfile.waterGoalMl}
          />
        )}
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit the dashboard, confirm the Water Intake card renders below Daily Rings showing "0 glasses" with 8 outlined glass icons. Tap "+" a few times, confirm the count increases, icons fill in, and the number animates. Tap "−" until it would go below 0, confirm a shake animation plays and the count doesn't go negative. Reload the page and confirm the count persisted (query `select * from water_entries where "profileId" = '<test profile id>';` via `mcp__supabase__execute_sql` to confirm one row for today with the right `amountMl`). Check both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add components/kokonutui/water-intake-tracker.tsx app/dashboard/page.tsx
git commit -m "feat: add water intake tracker widget to the dashboard"
```

---

### Task 3: Water tracker on the Plan page + Profile settings

**Files:**
- Modify: `app/session/page.tsx`
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `WaterIntakeTracker` from `@/components/kokonutui/water-intake-tracker` (Task 2).

- [ ] **Step 1: Fetch water fields on the Plan page and render the tracker for today**

In `app/session/page.tsx`, change the profile select (currently `select('id, lifestyle, currentStreak')`) to:
```tsx
          .select('id, lifestyle, currentStreak, waterUnit, glassSizeMl, waterGoalMl')
```

Add state (near `currentStreak`):
```tsx
  const [waterUnit, setWaterUnit] = useState<'glasses' | 'liters'>('glasses');
  const [glassSizeMl, setGlassSizeMl] = useState<number>(250);
  const [waterGoalMl, setWaterGoalMl] = useState<number>(2000);
```

Set them alongside `currentStreak` in the same `if (profileData)` block:
```tsx
        if (profileData) {
          setProfileId(profileData.id);
          setCurrentStreak(profileData.currentStreak ?? 0);
          setWaterUnit((profileData.waterUnit as 'glasses' | 'liters') ?? 'glasses');
          setGlassSizeMl(profileData.glassSizeMl ?? 250);
          setWaterGoalMl(profileData.waterGoalMl ?? 2000);
          if (profileData.lifestyle) {
            setLifestyle(profileData.lifestyle as LifestyleAnswers);
          }
        }
```

Add the import:
```tsx
import { WaterIntakeTracker } from '@/components/kokonutui/water-intake-tracker';
```

Render it in the today branch, right after the `WorkoutChecklist` block (inside the `isSameLocalDay(selectedDate, new Date())` branch added in the earlier Plan-page plan):
```tsx
            {/* Show workout checklist when a plan exists but not yet started */}
            {plan && (
              <div className="mt-6">
                <WorkoutChecklist workoutType={plan.bodyPart} />
              </div>
            )}
          </>
        ) : (
```
becomes:
```tsx
            {/* Show workout checklist when a plan exists but not yet started */}
            {plan && (
              <div className="mt-6">
                <WorkoutChecklist workoutType={plan.bodyPart} />
              </div>
            )}

            {profileId && (
              <WaterIntakeTracker
                profileId={profileId}
                waterUnit={waterUnit}
                glassSizeMl={glassSizeMl}
                waterGoalMl={waterGoalMl}
              />
            )}
          </>
        ) : (
```

- [ ] **Step 2: Add water settings to the Profile page**

In `app/profile/page.tsx`, add imports (near the other `lucide-react` icons import):
```tsx
import { GlassWater } from 'lucide-react';
```
(Add `GlassWater` to the existing `import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame, Settings, Cpu } from 'lucide-react';` line rather than a separate import statement.)

Add:
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

Change the profile select query — add the three new fields:
```tsx
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,avatarUrl')
```
becomes:
```tsx
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,avatarUrl,waterUnit,glassSizeMl,waterGoalMl')
```

Add a handler function (near `handleDisableAi`):
```tsx
  const handleWaterSettingChange = async (field: 'waterUnit' | 'glassSizeMl' | 'waterGoalMl', value: string | number) => {
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, [field]: value }));
    }
  };
```

Add a new settings card, right after the AI Insights card block (before the `{profile.isAdmin && (` admin blocks):
```tsx
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GlassWater className="w-5 h-5 text-sky-500" />
                    Water Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Unit</span>
                    <Select
                      value={profile.waterUnit}
                      onValueChange={(value) => handleWaterSettingChange('waterUnit', value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="glasses">Glasses</SelectItem>
                        <SelectItem value="liters">Liters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Glass size (ml)</span>
                    <input
                      type="number"
                      min={50}
                      max={1000}
                      defaultValue={profile.glassSizeMl}
                      onBlur={(e) => handleWaterSettingChange('glassSizeMl', Number(e.target.value))}
                      className="w-24 rounded-md border bg-background px-2 py-1 text-right"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Daily goal (ml)</span>
                    <input
                      type="number"
                      min={500}
                      max={10000}
                      step={250}
                      defaultValue={profile.waterGoalMl}
                      onBlur={(e) => handleWaterSettingChange('waterGoalMl', Number(e.target.value))}
                      className="w-24 rounded-md border bg-background px-2 py-1 text-right"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `/session`, confirm the Water Intake tracker now also appears there (today only — switch to a different weekday or Month-view-tap a past/future day and confirm it does NOT show for those). Confirm logging a glass from the Dashboard and then visiting the Plan page shows the same updated count (both read/write the same `(profileId, today)` row) — and vice versa. Visit `/profile`, confirm the new "Water Tracking" card, change the unit dropdown to "Liters" and confirm the Dashboard/Plan widgets immediately reflect liter-based display after a reload. Change glass size and goal values, confirm they persist after reload. Check both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add app/session/page.tsx app/profile/page.tsx
git commit -m "feat: add water tracker to the Plan page and unit settings to Profile"
```

---

### Task 4: Embed daily meal/goal rings in the Plan Day view

**Files:**
- Modify: `app/session/page.tsx`

**Interfaces:**
- Consumes: `DailyRingsWidget` from `@/app/dashboard/_components/DailyRingsWidget` (existing).

- [ ] **Step 1: Add a `refreshKey` state and render `DailyRingsWidget` for today**

Add the import:
```tsx
import { DailyRingsWidget } from '@/app/dashboard/_components/DailyRingsWidget';
```

Add state (near the other `useState` calls):
```tsx
  const [ringsRefreshKey] = useState(0);
```

Render it in the today branch, directly above the `WaterIntakeTracker` added in Task 3:
```tsx
            {profileId && (
              <WaterIntakeTracker
```
becomes:
```tsx
            {profileId && <DailyRingsWidget profileId={profileId} refreshKey={ringsRefreshKey} />}

            {profileId && (
              <WaterIntakeTracker
```

(`ringsRefreshKey` is a static `0` for now — nothing on this page currently invalidates it. This matches the prop contract `DailyRingsWidget` requires without over-building a refresh mechanism this page doesn't need yet.)

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `/session` (today view). Confirm the four activity rings (Burn/Eat/Move/Steps) render below the workout checklist and water tracker, matching the same values shown on the Dashboard for today. Switch to a past or future date via the Month calendar and confirm the rings do NOT render there (today-only). Check both light and dark mode.

- [ ] **Step 3: Commit**

```bash
git add app/session/page.tsx
git commit -m "feat: embed daily activity rings in the Plan page's Day view"
```

---

### Task 5: Monthly activity rollup in the Plan Month view

**Files:**
- Create: `app/session/_components/PlanMonthActivitySummary.tsx`
- Modify: `app/session/_components/PlanMonthCalendar.tsx`

**Interfaces:**
- Produces: `PlanMonthActivitySummary({ profileId, displayMonth }: PlanMonthActivitySummaryProps)` where `PlanMonthActivitySummaryProps = { profileId: string; displayMonth: Date }`.
- Consumes: `resolveTarget` from `@/lib/dailyTargets` (existing).

- [ ] **Step 1: Write `PlanMonthActivitySummary`**

```tsx
// app/session/_components/PlanMonthActivitySummary.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { resolveTarget } from '@/lib/dailyTargets';
import { cn } from '@/lib/utils';

type PlanMonthActivitySummaryProps = {
  profileId: string;
  displayMonth: Date;
};

type Totals = { burn: number; eat: number; steps: number };

const BARS = [
  { key: 'burn' as const, goalType: 'calories_burned', label: 'Burn', color: 'bg-[color:var(--chart-1)]' },
  { key: 'eat' as const, goalType: 'calories_intake', label: 'Eat', color: 'bg-[color:var(--chart-3)]' },
  { key: 'steps' as const, goalType: 'daily_steps', label: 'Steps', color: 'bg-[color:var(--chart-2)]' },
];

export function PlanMonthActivitySummary({ profileId, displayMonth }: PlanMonthActivitySummaryProps) {
  const supabase = createClientComponentClient();
  const [totals, setTotals] = useState<Totals>({ burn: 0, eat: 0, steps: 0 });
  const [goals, setGoals] = useState<{ goalType: string; targetValue: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
      const now = new Date();
      const monthEnd = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1);
      const rangeEnd = now < monthEnd ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : monthEnd;

      const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
        supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
        supabase
          .from('calorie_burns')
          .select('caloriesBurned')
          .eq('profileId', profileId)
          .gte('date', monthStart.toISOString())
          .lt('date', rangeEnd.toISOString()),
        supabase
          .from('food_intakes')
          .select('calories')
          .eq('profileId', profileId)
          .gte('date', monthStart.toISOString())
          .lt('date', rangeEnd.toISOString()),
        supabase
          .from('step_entries')
          .select('steps')
          .eq('profileId', profileId)
          .gte('date', monthStart.toISOString())
          .lt('date', rangeEnd.toISOString()),
      ]);

      if (cancelled) return;

      setGoals(goalsRes.data ?? []);
      setTotals({
        burn: (burnRes.data ?? []).reduce((sum, r) => sum + (r.caloriesBurned ?? 0), 0),
        eat: (eatRes.data ?? []).reduce((sum, r) => sum + (r.calories ?? 0), 0),
        steps: (stepsRes.data ?? []).reduce((sum, r) => sum + (r.steps ?? 0), 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, displayMonth]);

  const now = new Date();
  const isDisplayedMonthCurrent =
    now.getFullYear() === displayMonth.getFullYear() && now.getMonth() === displayMonth.getMonth();
  const daysElapsed = isDisplayedMonthCurrent
    ? now.getDate()
    : new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate();

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">Monthly progress</p>
      {BARS.map((bar) => {
        const target = resolveTarget(goals, bar.goalType) * daysElapsed;
        const value = totals[bar.key];
        const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
        return (
          <div key={bar.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{bar.label}</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div className={cn('h-1.5 rounded-full', bar.color)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `PlanMonthCalendar`**

In `app/session/_components/PlanMonthCalendar.tsx`, add the import:
```tsx
import { PlanMonthActivitySummary } from './PlanMonthActivitySummary';
```

Render it right after the streak/rest-day header row, before the prev/next month navigation row. Find:
```tsx
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
          <Flame className="size-4" />
          {currentStreak} day streak
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Moon className="size-4" />
          {restDaysThisMonth} rest day{restDaysThisMonth === 1 ? '' : 's'}
        </div>
      </div>

      <div className="flex items-center justify-between">
```
and insert between the two blocks:
```tsx
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
          <Flame className="size-4" />
          {currentStreak} day streak
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Moon className="size-4" />
          {restDaysThisMonth} rest day{restDaysThisMonth === 1 ? '' : 's'}
        </div>
      </div>

      <PlanMonthActivitySummary profileId={profileId} displayMonth={displayMonth} />

      <div className="flex items-center justify-between">
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `/session`, switch to Month view. Confirm a "Monthly progress" box renders between the streak header and the prev/next month controls, with three progress bars (Burn/Eat/Steps) and percentages. Log some calories/food/steps for today via the dashboard's quick-log, return to the Plan Month view, and confirm the percentages update (may need a page reload since this component doesn't share a refresh trigger with the dashboard's quick-log — that's expected, not a bug, given no such wiring was requested). Navigate to the previous month and confirm the percentages recompute using that month's full day count as the denominator (not "days elapsed," since that month is fully in the past). Check both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add app/session/_components/PlanMonthActivitySummary.tsx app/session/_components/PlanMonthCalendar.tsx
git commit -m "feat: add monthly activity rollup to the Plan Month view"
```

---

### Task 6: Profile dropdown menu

**Files:**
- Modify: `package.json` (add `@radix-ui/react-dropdown-menu`)
- Create: `components/ui/dropdown-menu.tsx`
- Create: `components/ProfileMenu.tsx`
- Modify: `components/BottomNav.tsx`

**Interfaces:**
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` (standard shadcn primitives) from `components/ui/dropdown-menu.tsx`. `ProfileMenu({ isActive }: { isActive: boolean })` from `components/ProfileMenu.tsx`.

- [ ] **Step 1: Install the Radix primitive**

Run: `npm install @radix-ui/react-dropdown-menu`
Expected: added to `package.json`, no errors.

- [ ] **Step 2: Write the shadcn DropdownMenu wrapper**

```tsx
// components/ui/dropdown-menu.tsx
"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"

import { cn } from "@/lib/utils"

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
```

- [ ] **Step 3: Write `ProfileMenu`**

```tsx
// components/ProfileMenu.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { motion } from 'motion/react';
import { UserIcon, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ProfileMenuProps = {
  isActive: boolean;
};

export function ProfileMenu({ isActive }: ProfileMenuProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {isActive && (
            <motion.span
              layoutId="bottom-nav-active"
              className="absolute inset-0 rounded-full bg-primary/10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <UserIcon className="relative z-10 mb-0.5 h-5 w-5" />
          <span className="relative z-10">Profile</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center">
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <UserIcon className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Wire into `BottomNav`**

Replace the full contents of `components/BottomNav.tsx`:
```tsx
// components/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  HomeIcon,
  DumbbellIcon,
  TargetIcon,
  ChartLine
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileMenu } from '@/components/ProfileMenu';

const tabs = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/session',   label: 'Plan', Icon: DumbbellIcon },
  { href: '/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/insights',  label: 'Insights', Icon: ChartLine },
];

export function BottomNav() {
  const pathname = usePathname();
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

From any page, tap the "Profile" entry in the bottom nav. Confirm a dropdown opens **upward** (not clipped by the viewport bottom) showing "Profile" and "Log Out", with a divider between them. Tap "Profile" — confirm it navigates to `/profile`. Reopen the dropdown, tap "Log Out" — confirm it signs out and redirects to `/login`. Log back in and confirm the Profile tab's active-state highlight (the sliding pill) still works correctly when on `/profile` — it should share the same visual language as the other four tabs even though it's no longer a plain `<Link>`. Check both light and dark mode.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/ui/dropdown-menu.tsx components/ProfileMenu.tsx components/BottomNav.tsx
git commit -m "feat: replace direct Profile nav link with a dropdown menu"
```

---

### Task 7: Animated weekday tabs, replacing `DayNavigator`

**Files:**
- Create: `components/kokonutui/weekday-tabs.tsx`
- Delete: `app/session/_components/DayNavigator.tsx`
- Modify: `app/session/page.tsx`
- Modify: `app/session/_components/AddWorkoutModal.tsx` (comment-only correction)

**Interfaces:**
- Produces: `WeekdayTabs({ value, onChange }: { value: number; onChange: (day: number) => void })` — identical contract to the `DayNavigator` it replaces, so no other wiring in `page.tsx` needs to change beyond the import and JSX tag name.

- [ ] **Step 1: Write `WeekdayTabs`**

```tsx
// components/kokonutui/weekday-tabs.tsx
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// Values are the canonical dayOfWeek convention used everywhere else in the
// app (0=Sun...6=Sat). This array only controls *display order* (Mon first).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

type WeekdayTabsProps = {
  value: number;
  onChange: (day: number) => void;
};

export function WeekdayTabs({ value, onChange }: WeekdayTabsProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex w-full justify-around gap-1 px-4 py-2">
      {DISPLAY_ORDER.map((dayOfWeek) => {
        const isActive = dayOfWeek === value;
        const isHovered = hovered === dayOfWeek;
        return (
          <button
            key={dayOfWeek}
            type="button"
            onClick={() => onChange(dayOfWeek)}
            onMouseEnter={() => setHovered(dayOfWeek)}
            onMouseLeave={() => setHovered(null)}
            className="relative flex-1 rounded-lg py-1.5 text-center text-sm font-medium"
          >
            {isActive && (
              <motion.span
                layoutId="weekday-tabs-active"
                className="absolute inset-0 rounded-lg bg-primary"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {!isActive && isHovered && <span className="absolute inset-0 rounded-lg bg-muted" />}
            <span
              className={cn(
                'relative z-10',
                isActive ? 'text-primary-foreground' : 'text-foreground dark:text-gray-200'
              )}
            >
              {LABELS[dayOfWeek]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Swap it into `app/session/page.tsx`**

Replace the import:
```tsx
import { DayNavigator } from './_components/DayNavigator';
```
with:
```tsx
import { WeekdayTabs } from '@/components/kokonutui/weekday-tabs';
```

Replace the JSX tag (props are unchanged — same `value`/`onChange` contract):
```tsx
        <DayNavigator
          value={day}
          onChange={(newDay) => {
            setDay(newDay);
            setSelectedDate(nearestPastOrTodayWeekday(newDay));
          }}
        />
```
with:
```tsx
        <WeekdayTabs
          value={day}
          onChange={(newDay) => {
            setDay(newDay);
            setSelectedDate(nearestPastOrTodayWeekday(newDay));
          }}
        />
```

- [ ] **Step 3: Delete `DayNavigator` and fix the stray comment reference**

```bash
rm app/session/_components/DayNavigator.tsx
```

In `app/session/_components/AddWorkoutModal.tsx`, find the comment:
```tsx
// display order only (Mon first), matching DayNavigator.
```
and change it to:
```tsx
// display order only (Mon first), matching WeekdayTabs.
```

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors (confirms nothing else imported `DayNavigator`).

Visit `/session` (Day view). Confirm the weekday picker now shows a sliding highlight (colored background) behind the active day, animating smoothly when you tap a different day. Hover over (or, on touch, briefly tap-and-hold isn't required — just confirm click-through works) a non-active day and confirm a fainter background preview appears on desktop hover. Confirm selecting a weekday still correctly updates `selectedDate` (jumping to the nearest past/today occurrence, per existing `nearestPastOrTodayWeekday` logic) exactly as `DayNavigator` did. Check both light and dark mode.

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/weekday-tabs.tsx app/session/page.tsx app/session/_components/AddWorkoutModal.tsx
git rm app/session/_components/DayNavigator.tsx
git commit -m "feat: replace DayNavigator with animated WeekdayTabs"
```

---

### Task 8: Theme-specific splash screen backgrounds

**Files:**
- Create: `components/kokonutui/wavy-background.tsx`
- Create: `components/kokonutui/lines-gradient-shader.tsx`
- Delete: `components/kokonutui/background-paths.tsx`
- Modify: `components/SplashScreen.tsx`

**Interfaces:**
- Produces: `WavyBackground({ className }: { className?: string })`, `LinesGradientShader({ className }: { className?: string })` — both self-contained canvas-rendered backgrounds, no external state.

- [ ] **Step 1: Write `WavyBackground` (light mode)**

```tsx
// components/kokonutui/wavy-background.tsx
'use client';

import { useEffect, useRef } from 'react';

const COLORS = ['#FF9E4F', '#F97316', '#EF4444', '#B55233'];

export function WavyBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = canvas.width = canvas.offsetWidth * dpr;
      height = canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#FFF7ED';
      ctx.fillRect(0, 0, width, height);

      COLORS.forEach((color, i) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 3 * dpr;
        const amplitude = 40 * dpr;
        const wavelength = 220 * dpr;
        const yOffset = height * (0.3 + i * 0.15);
        for (let x = 0; x <= width; x += 6) {
          const y = yOffset + Math.sin(x / wavelength + t + i) * amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      t += 0.01;
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
```

- [ ] **Step 2: Write `LinesGradientShader` (dark mode)**

```tsx
// components/kokonutui/lines-gradient-shader.tsx
'use client';

import { useEffect, useRef } from 'react';

export function LinesGradientShader({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = canvas.width = canvas.offsetWidth * dpr;
      height = canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const LINE_COUNT = 12;

    const render = () => {
      ctx.fillStyle = '#1a0f0a';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < LINE_COUNT; i++) {
        const progress = i / LINE_COUNT;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        const shift = (t + progress) % 1;
        gradient.addColorStop(Math.max(0, shift - 0.15), 'rgba(255,158,79,0)');
        gradient.addColorStop(shift, 'rgba(255,61,113,0.8)');
        gradient.addColorStop(Math.min(1, shift + 0.15), 'rgba(255,158,79,0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        const y = height * (progress + 0.02 * Math.sin(t * 4 + i));
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      t += 0.003;
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
```

- [ ] **Step 3: Wire both into `SplashScreen`, delete `BackgroundPaths`**

Replace the full contents of `components/SplashScreen.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { KineticText } from '@/components/ui/kinetic-text';
import { WavyBackground } from '@/components/kokonutui/wavy-background';
import { LinesGradientShader } from '@/components/kokonutui/lines-gradient-shader';
import { cn } from '@/lib/utils';

const SESSION_KEY = 'burnlog-splash-shown';
const VISIBLE_MS = 2000;
const FADE_MS = 600;

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Only show once per browser session (first load)
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    setIsDark(document.documentElement.classList.contains('dark'));
    sessionStorage.setItem(SESSION_KEY, '1');
    setMounted(true);

    const leaveTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    const removeTimer = setTimeout(() => setMounted(false), VISIBLE_MS + FADE_MS);

    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-label="Loading burnlog"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      {isDark ? (
        <LinesGradientShader className="pointer-events-none absolute inset-0 h-full w-full" />
      ) : (
        <WavyBackground className="pointer-events-none absolute inset-0 h-full w-full" />
      )}

      <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
        <KineticText
          text="burnlog"
          className={cn(
            'justify-center text-[clamp(2.75rem,14vw,6rem)] leading-none tracking-tight select-none',
            isDark ? 'text-[#FF9E4F]' : 'text-[#B5471B]'
          )}
        />
        <p
          className={cn(
            'mt-4 text-sm font-medium tracking-[0.3em] uppercase',
            isDark ? 'text-amber-200/70' : 'text-amber-900/60'
          )}
        >
          Track the burn
        </p>
      </div>
    </div>
  );
}
```

Delete the now-unused component:
```bash
rm components/kokonutui/background-paths.tsx
```

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors (confirms nothing else imported `BackgroundPaths`).

The splash screen only shows once per browser session (`sessionStorage` gate) — to re-trigger it for testing, clear session storage or open a fresh incognito/private window. Set the OS/browser to light mode (or toggle the app to light mode and reload in a fresh session), confirm the splash screen shows animated brand-colored wavy lines with the "burnlog" text and tagline legible on top. Switch to dark mode the same way, confirm the splash screen shows the animated gradient-lines effect instead, also with legible text. Confirm the splash auto-dismisses after ~2.6s in both cases (matches the existing `VISIBLE_MS`/`FADE_MS` timing, unchanged).

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/wavy-background.tsx components/kokonutui/lines-gradient-shader.tsx components/SplashScreen.tsx
git rm components/kokonutui/background-paths.tsx
git commit -m "feat: theme-specific animated splash screen backgrounds"
```
