# Nav Preloading — Foundation + BurnLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared preload mechanism (idle-preload hook, nav-link code prefetch, a `loading.tsx` pattern) and prove it end-to-end on BurnLog, so tapping a BurnLog bottom-nav tab shows content immediately instead of a fresh spinner.

**Architecture:** A per-app "query registry" (`lib/<app>/queries.ts`) co-locates each preloadable page's SWR key + fetcher, so a page's own `useSWR(...)` call and the preloader's `preload(...)` call are guaranteed to use the identical key/fetcher pair. Each app's bottom nav calls a shared `usePreloadRoutes()` hook on idle, which calls SWR's `preload()` for every registry entry. Nav `<Link>`s get `prefetch` so the route's code/RSC payload is warmed too, and a `loading.tsx` per app makes that prefetch actually complete (Next only partially prefetches dynamic routes without one).

**Tech Stack:** Next.js App Router, `swr@2.5.1` (already installed — `preload()` confirmed present), Supabase JS client, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies — `swr` is already installed and already exports `preload`.
- Follow the existing SWR key convention already used in this codebase: `` [`${app}-${resource}`, profileId, ...params] `` (e.g. `'burnlog-fitness-goals'`, `'burnlog-workout-plan'`). `useCurrentProfile()`'s key (`'current-profile'`, from `lib/useCurrentProfile.ts`) is the one exception — no app prefix, since it's shared globally across all 9 apps.
- Zero `.tsx`/component tests exist anywhere in this repo (confirmed: `find . -name "*.test.tsx"` → 0 results; all 50 existing `*.test.ts` files test plain `lib/*.ts` logic). Match that convention: give every new *testable pure function* (registry fetchers, taking an explicit `SupabaseClient` param, mirroring `lib/burnlog/intel.ts`'s existing pattern) a real Vitest test. Verify React glue (hooks, page wiring, `loading.tsx`) via `tsc`/`eslint` plus the manual steps in each task — do not invent a new component-testing framework for this plan.
- Never fetch inside the render body without a stable SWR key — every `useSWR` call in this plan follows the existing repo pattern of `key: condition ? [...] : null` so SWR skips the fetch until its inputs are ready.

---

## File Structure

New files:
- `lib/usePreloadRoutes.ts` — the shared idle-preload hook (used by every app's nav; only BurnLog's nav wires it up in this plan).
- `lib/burnlog/queries.ts` — BurnLog's query registry: `fitnessGoalsQuery`, `workoutPlanQuery`, `dateSessionQuery`, plus their testable `fetchX(supabase, ...)` cores.
- `lib/burnlog/queries.test.ts` — Vitest coverage for the three `fetchX` functions and the registry factories' key shapes.
- `app/(burnlog)/burnlog/loading.tsx` — the loading-UI Suspense boundary for `/burnlog/*`.

Modified files:
- `components/ConfigMenu.tsx` — add `prefetch` to its `<Link>` (shared by 8 of 9 apps' settings link).
- `components/ProfileMenu.tsx` — add `router.prefetch('/profile')` on mount (it navigates imperatively via `router.push`, not a `<Link>`, so this is the correct idiomatic equivalent).
- `app/(burnlog)/burnlog/dashboard/page.tsx` — consume `fitnessGoalsQuery` from the registry instead of its own inline key/fetcher.
- `app/(burnlog)/burnlog/goals/page.tsx` — consume `useCurrentProfile()` + `fitnessGoalsQuery` instead of its own `userId`→profile-lookup→goals chain (this was a second, independently-keyed fetch of the exact same data dashboard already fetches — unifying them is a direct, concrete instance of the "registry prevents drift" problem the spec calls out).
- `app/(burnlog)/burnlog/session/page.tsx` — consume `useCurrentProfile()` instead of its own `burnlog-session-profile` SWR call (same drift problem — this key duplicated `useCurrentProfile`'s job), plus `workoutPlanQuery`/`dateSessionQuery` from the registry.
- `app/(burnlog)/burnlog/meal-planner/_components/MealPlannerFlow.tsx` — consume `useCurrentProfile()` instead of its own `auth.getUser()` + `profiles` select. No new registry entry needed: this page only needs `id` + `lifestyle`, both already on the shared profile row.
- `components/BottomNav.tsx` — call `useCurrentProfile()` + `usePreloadRoutes()` to warm `fitnessGoalsQuery` and today's `workoutPlanQuery` on idle.

---

## Task 1: `usePreloadRoutes` hook

**Files:**
- Create: `lib/usePreloadRoutes.ts`

**Interfaces:**
- Produces: `usePreloadRoutes(queries: PreloadableQuery[]): void`, and the exported type `PreloadableQuery = { key: unknown; fetcher: () => Promise<unknown> }` that every later task's registry entries must structurally match (a `{ key, fetcher }` object works — no explicit type import required by callers).

- [ ] **Step 1: Write the hook**

```ts
// lib/usePreloadRoutes.ts
'use client';

import { useEffect } from 'react';
import { preload } from 'swr';

export type PreloadableQuery = {
  key: unknown;
  fetcher: () => Promise<unknown>;
};

/**
 * Warms the SWR cache for a set of queries on browser idle time, so
 * navigating to a page that calls `useSWR` with the same key/fetcher pair
 * (from the same registry entry — see lib/<app>/queries.ts) renders from
 * cache instead of showing a loading state. Runs on idle rather than on
 * mount so it never competes with the current page's own first paint.
 *
 * `requestIdleCallback` isn't available in Safari, so this falls back to a
 * short `setTimeout` — this app is PWA/mobile-first, so that fallback path
 * matters in practice, not just in theory.
 */
export function usePreloadRoutes(queries: PreloadableQuery[]) {
  useEffect(() => {
    if (queries.length === 0) return;

    const run = () => {
      for (const query of queries) {
        preload(query.key, query.fetcher);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(id);
    }

    const id = window.setTimeout(run, 200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries]);
}
```

The `eslint-disable` is deliberate: `queries` is an array literal built fresh on every render by callers (see Task 8), so an exhaustive-deps array dependency would cause the effect to re-fire every render, defeating the "idle" intent. Callers are responsible for passing a reasonably stable list (Task 8's `BottomNav` only rebuilds it when `profileId`/`day` actually change).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep usePreloadRoutes` — expect no output.
Run: `npx eslint lib/usePreloadRoutes.ts` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add lib/usePreloadRoutes.ts
git commit -m "$(cat <<'EOF'
feat: add usePreloadRoutes hook for idle SWR cache warming

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Prefetch on shared nav components (`ConfigMenu`, `ProfileMenu`)

These two components are rendered by 8 of the 9 apps' bottom navs (every app except LogBook, which uses its own inline profile link) — one change here benefits every app's settings/profile navigation immediately, which is why it belongs in the foundation task rather than a per-app task.

**Files:**
- Modify: `components/ConfigMenu.tsx`
- Modify: `components/ProfileMenu.tsx`

- [ ] **Step 1: Add `prefetch` to `ConfigMenu`'s `<Link>`**

In `components/ConfigMenu.tsx`, change:

```tsx
    <Link
      href={href}
      className={cn(
```

to:

```tsx
    <Link
      href={href}
      prefetch
      className={cn(
```

- [ ] **Step 2: Prefetch `/profile` from `ProfileMenu`**

`ProfileMenu` navigates to `/profile` imperatively (`router.push('/profile')` inside a `DropdownMenuItem onClick`, not a `<Link>`), so there's no `<Link prefetch>` to add — the idiomatic equivalent is calling the router's own `.prefetch()` once on mount.

In `components/ProfileMenu.tsx`, add the import and effect:

```tsx
import { useState } from 'react';
import { useEffect, useState } from 'react';
```

Replace the import line above with the merged one (this file already has `import { useState } from 'react';` at the top — the diff is adding `useEffect` to that same import), then add the effect right after the `handleLogout` function:

```tsx
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    router.prefetch('/profile');
  }, [router]);
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "ConfigMenu|ProfileMenu"` — expect no output.
Run: `npx eslint components/ConfigMenu.tsx components/ProfileMenu.tsx` — expect no output.

- [ ] **Step 4: Commit**

```bash
git add components/ConfigMenu.tsx components/ProfileMenu.tsx
git commit -m "$(cat <<'EOF'
perf: prefetch config/profile nav destinations

ConfigMenu's Link now prefetches like every other nav item; ProfileMenu
navigates imperatively via router.push, so it gets the equivalent
router.prefetch() on mount instead. Shared by 8 of 9 apps.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: BurnLog query registry

**Files:**
- Create: `lib/burnlog/queries.ts`
- Test: `lib/burnlog/queries.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type FitnessGoal = { id: string; goalType: string; targetValue: number }`
  - `fetchFitnessGoals(supabase: SupabaseClient, profileId: string): Promise<FitnessGoal[]>`
  - `fitnessGoalsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<FitnessGoal[]> }`
  - `type WorkoutPlanDay = { dayIndex: number; bodyPart: string; repeatWeekly: boolean } | null`
  - `fetchWorkoutPlan(supabase: SupabaseClient, profileId: string, dayOfWeek: number): Promise<WorkoutPlanDay>`
  - `workoutPlanQuery(profileId: string, dayOfWeek: number): { key: readonly [string, string, number]; fetcher: () => Promise<WorkoutPlanDay> }`
  - `type DateSession = { completed: boolean; bodyPart?: string; duration?: number; notes?: string } | null`
  - `fetchDateSession(supabase: SupabaseClient, profileId: string, dateStr: string): Promise<DateSession>`
  - `dateSessionQuery(profileId: string, dateStr: string): { key: readonly [string, string, string]; fetcher: () => Promise<DateSession> }`

These names and signatures are what Tasks 4–8 import — later tasks don't redefine them.

- [ ] **Step 1: Write the registry**

```ts
// lib/burnlog/queries.ts
//
// Single source of truth for BurnLog's preloadable page queries. Each
// `xQuery(...)` factory returns the exact `{ key, fetcher }` pair a page's
// own `useSWR(...)` call uses AND the exact pair `usePreloadRoutes` warms —
// they can't drift apart because both call sites import the same function.
//
// The underlying `fetchX(supabase, ...)` functions take an explicit
// SupabaseClient so they're unit-testable without mocking module-level
// `createClient()` — the same pattern lib/burnlog/intel.ts already uses.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type FitnessGoal = {
  id: string;
  goalType: string;
  targetValue: number;
};

export async function fetchFitnessGoals(supabase: SupabaseClient, profileId: string): Promise<FitnessGoal[]> {
  const { data, error } = await supabase.from('fitness_goals').select('*').eq('profileId', profileId);
  if (error) throw error;
  return (data as FitnessGoal[]) ?? [];
}

export function fitnessGoalsQuery(profileId: string) {
  return {
    key: ['burnlog-fitness-goals', profileId] as const,
    fetcher: () => fetchFitnessGoals(createClient(), profileId),
  };
}

export type WorkoutPlanDay = { dayIndex: number; bodyPart: string; repeatWeekly: boolean } | null;

export async function fetchWorkoutPlan(
  supabase: SupabaseClient,
  profileId: string,
  dayOfWeek: number
): Promise<WorkoutPlanDay> {
  const { data } = await supabase
    .from('workout_plans')
    .select('dayOfWeek, bodyPart, repeatWeekly')
    .eq('profileId', profileId)
    .eq('dayOfWeek', dayOfWeek)
    .single();
  return data ? { dayIndex: data.dayOfWeek, bodyPart: data.bodyPart, repeatWeekly: data.repeatWeekly } : null;
}

export function workoutPlanQuery(profileId: string, dayOfWeek: number) {
  return {
    key: ['burnlog-workout-plan', profileId, dayOfWeek] as const,
    fetcher: () => fetchWorkoutPlan(createClient(), profileId, dayOfWeek),
  };
}

export type DateSession = { completed: boolean; bodyPart?: string; duration?: number; notes?: string } | null;

export async function fetchDateSession(
  supabase: SupabaseClient,
  profileId: string,
  dateStr: string
): Promise<DateSession> {
  const { data } = await supabase
    .from('sessions')
    .select('sessionData')
    .eq('profileId', profileId)
    .eq('date', dateStr)
    .maybeSingle();
  return data ? (data.sessionData as DateSession) : null;
}

export function dateSessionQuery(profileId: string, dateStr: string) {
  return {
    key: ['burnlog-date-session', profileId, dateStr] as const,
    fetcher: () => fetchDateSession(createClient(), profileId, dateStr),
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/burnlog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  fetchFitnessGoals,
  fetchWorkoutPlan,
  fetchDateSession,
  fitnessGoalsQuery,
  workoutPlanQuery,
  dateSessionQuery,
} from './queries';

function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(resolved);
  const maybeSingle = vi.fn().mockResolvedValue(resolved);
  const eqSecond = vi.fn().mockReturnValue({ single, maybeSingle });
  const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond, single, maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqFirst });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchFitnessGoals', () => {
  it('returns the profile\'s fitness goals', async () => {
    const goals = [{ id: 'g1', goalType: 'weight_loss', targetValue: 70 }];
    const supabase = fakeSupabase({ data: goals, error: null });
    const result = await fetchFitnessGoals(supabase, 'profile-1');
    expect(result).toEqual(goals);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchFitnessGoals(supabase, 'profile-1')).rejects.toThrow('boom');
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchFitnessGoals(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchWorkoutPlan', () => {
  it('maps a found row to a WorkoutPlanDay', async () => {
    const supabase = fakeSupabase({
      data: { dayOfWeek: 2, bodyPart: 'Push', repeatWeekly: true },
      error: null,
    });
    const result = await fetchWorkoutPlan(supabase, 'profile-1', 2);
    expect(result).toEqual({ dayIndex: 2, bodyPart: 'Push', repeatWeekly: true });
  });

  it('returns null when no plan exists for that day', async () => {
    const supabase = fakeSupabase({ data: null, error: { code: 'PGRST116' } });
    const result = await fetchWorkoutPlan(supabase, 'profile-1', 2);
    expect(result).toBeNull();
  });
});

describe('fetchDateSession', () => {
  it('returns the sessionData for a logged session', async () => {
    const sessionData = { completed: true, bodyPart: 'Legs' };
    const supabase = fakeSupabase({ data: { sessionData }, error: null });
    const result = await fetchDateSession(supabase, 'profile-1', '2026-09-01');
    expect(result).toEqual(sessionData);
  });

  it('returns null when no session was logged that day', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchDateSession(supabase, 'profile-1', '2026-09-01');
    expect(result).toBeNull();
  });
});

describe('registry key shapes', () => {
  it('fitnessGoalsQuery keys by app+resource+profileId', () => {
    expect(fitnessGoalsQuery('profile-1').key).toEqual(['burnlog-fitness-goals', 'profile-1']);
  });

  it('workoutPlanQuery keys by app+resource+profileId+day', () => {
    expect(workoutPlanQuery('profile-1', 3).key).toEqual(['burnlog-workout-plan', 'profile-1', 3]);
  });

  it('dateSessionQuery keys by app+resource+profileId+date', () => {
    expect(dateSessionQuery('profile-1', '2026-09-01').key).toEqual([
      'burnlog-date-session',
      'profile-1',
      '2026-09-01',
    ]);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/burnlog/queries.test.ts`
Expected: all 9 tests PASS (the implementation was written in Step 1, so this confirms correctness rather than TDD red→green — that's fine here since the registry is a thin, low-risk restatement of logic that already existed and worked in `dashboard/page.tsx` and `session/page.tsx`).

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/burnlog/queries"` — expect no output.
Run: `npx eslint lib/burnlog/queries.ts lib/burnlog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/burnlog/queries.ts lib/burnlog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add BurnLog query registry (fitness goals, workout plan, date session)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `dashboard/page.tsx` to the registry

**Files:**
- Modify: `app/(burnlog)/burnlog/dashboard/page.tsx`

**Interfaces:**
- Consumes: `fitnessGoalsQuery` from `lib/burnlog/queries.ts` (Task 3).

- [ ] **Step 1: Replace the inline goals fetch**

In `app/(burnlog)/burnlog/dashboard/page.tsx`, change the import block:

```tsx
import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
```

to:

```tsx
import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { fitnessGoalsQuery, type FitnessGoal } from '@/lib/burnlog/queries';
```

(`createClient` is no longer called directly in this file once the goals fetch moves into the registry — the registry's `fetchFitnessGoals` calls it internally.)

Remove the local `FitnessGoal` interface:

```tsx
interface FitnessGoal {
  id: string;
  goalType: string;
  targetValue: number | string;
}
```

(this is now imported from the registry instead).

Change:

```tsx
export default function DashboardPage() {
  const supabase = createClient();
  const { profile: userProfile, loading: profileLoading } = useCurrentProfile() as { profile: any; loading: boolean };
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: goals, isLoading: goalsLoading, mutate: mutateGoals } = useSWR(
    userProfile ? ['burnlog-fitness-goals', userProfile.id] : null,
    async () => {
      const { data } = await supabase.from('fitness_goals').select('*').eq('profileId', userProfile.id);
      return (data as FitnessGoal[]) || [];
    }
  );
  const [refreshing, setRefreshing] = useState(false);
```

to:

```tsx
export default function DashboardPage() {
  const { profile: userProfile, loading: profileLoading } = useCurrentProfile() as { profile: any; loading: boolean };
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: goals, isLoading: goalsLoading, mutate: mutateGoals } = useSWR<FitnessGoal[]>(
    userProfile ? fitnessGoalsQuery(userProfile.id).key : null,
    userProfile ? fitnessGoalsQuery(userProfile.id).fetcher : null
  );
  const [refreshing, setRefreshing] = useState(false);
```

Everything below this (the `weightGoal` derivation, JSX) is unchanged — `goals` still has the same shape consumers expect (`id`, `goalType`, `targetValue`), just `targetValue` is now `number` instead of `number | string`. Check the one place that matters:

```tsx
targetValue: Number(weightGoal.targetValue),
```

`Number(x)` on an already-`number` `x` is a no-op, so this line needs no change.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "dashboard/page"` — expect no output.
Run: `npx eslint "app/(burnlog)/burnlog/dashboard/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(burnlog)/burnlog/dashboard/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: dashboard consumes shared fitnessGoalsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Convert `goals/page.tsx` to `useCurrentProfile` + the registry

This is the concrete drift the spec warned about: this page independently re-resolved `profileId` from `userId` and fetched `fitness_goals` under a *different* SWR key (`'burnlog-goals'`) than the identical fetch dashboard makes (`'burnlog-fitness-goals'`) — two cache entries for the same data, so preloading one never helped the other. Converting both to the same registry entry fixes that as a side effect of this task, not a separate cleanup.

**Files:**
- Modify: `app/(burnlog)/burnlog/goals/page.tsx`

**Interfaces:**
- Consumes: `useCurrentProfile()` from `lib/useCurrentProfile.ts` (existing), `fitnessGoalsQuery` from `lib/burnlog/queries.ts` (Task 3).
- Produces: `export type Goal` stays exported from this file (re-exported from the registry's `FitnessGoal`) — `app/(burnlog)/burnlog/goals/_components/GoalsList.tsx` imports `Goal` from `'../page'` and must keep working unchanged.

- [ ] **Step 1: Replace the fetch chain**

Change the import block:

```tsx
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StaminaTracker } from './_components/StaminaTracker';
import { FoodIntakeTracker } from './_components/FoodIntakeTracker';
import { CalorieTracker } from './_components/CalorieTracker';
import { WeightTracker } from './_components/WeightTracker';
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalsList } from './_components/GoalsList';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/TopBar';
```

to:

```tsx
import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StaminaTracker } from './_components/StaminaTracker';
import { FoodIntakeTracker } from './_components/FoodIntakeTracker';
import { CalorieTracker } from './_components/CalorieTracker';
import { WeightTracker } from './_components/WeightTracker';
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalsList } from './_components/GoalsList';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { fitnessGoalsQuery, type FitnessGoal } from '@/lib/burnlog/queries';
import { TopBar } from '@/components/TopBar';
```

Change:

```tsx
export type Goal = {
  id: string;
  goalType: string;
  targetValue: number;
  createdAt: string;
};

const supabase = createClient();

const goalTabs: TabItem[] = [
```

to:

```tsx
export type Goal = FitnessGoal;

const goalTabs: TabItem[] = [
```

Change the whole component body from:

```tsx
export default function GoalsPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null));
  }, []);

  const { data: goals = [], isLoading: loading, mutate: mutateGoals } = useSWR<Goal[]>(
    userId ? ['burnlog-goals', userId] : null,
    async () => {
      // First get the profile ID
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId!)
        .single();
      if (!profileData) {
        console.error('Profile not found');
        return [];
      }

      // Then get the goals for this profile
      const { data, error } = await supabase
        .from('fitness_goals')
        .select('*')
        .eq('profileId', profileData.id);
      if (error) throw error;
      return (data as Goal[]) ?? [];
    },
    {
      onError: (error) => {
        toast({
          title: 'Failed to load goals',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    }
  );

  const handleRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await mutateGoals();
    } finally {
      setRefreshing(false);
    }
  };

  const handleGoalAdded = (newGoal: Goal) => {
    mutateGoals([...goals, newGoal], { revalidate: false });
  };
```

to:

```tsx
export default function GoalsPage() {
  const { toast } = useToast();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const userId = profile?.userId ?? null;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const { data: goals = [], isLoading: goalsLoading, mutate: mutateGoals } = useSWR<Goal[]>(
    profile ? fitnessGoalsQuery(profile.id).key : null,
    profile ? fitnessGoalsQuery(profile.id).fetcher : null,
    {
      onError: (error) => {
        toast({
          title: 'Failed to load goals',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    }
  );
  const loading = profileLoading || goalsLoading;

  const handleRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await mutateGoals();
    } finally {
      setRefreshing(false);
    }
  };

  const handleGoalAdded = (newGoal: Goal) => {
    mutateGoals([...goals, newGoal], { revalidate: false });
  };
```

Nothing else in the file changes — the rest of the component still reads `loading`, `goals`, `userId`, `handleRefresh`, `handleGoalAdded`, all with the same names and shapes as before.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "goals/page"` — expect no output (this also catches `GoalsList.tsx`'s `import { Goal } from '../page'` breaking, since it's the same compilation).
Run: `npx eslint "app/(burnlog)/burnlog/goals/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(burnlog)/burnlog/goals/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: goals page shares dashboard's fitnessGoalsQuery cache entry

Previously fetched the same fitness_goals data under a different SWR key
('burnlog-goals' vs dashboard's 'burnlog-fitness-goals'), with its own
redundant userId->profile lookup dashboard already did via
useCurrentProfile. Unifying the key means preloading one tab now warms
both.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: Convert `session/page.tsx` to `useCurrentProfile` + the registry

Same drift problem as Task 5: this page's `'burnlog-session-profile'` SWR key fetched a subset of the exact same `profiles` row `useCurrentProfile()` already fetches and caches globally.

**Files:**
- Modify: `app/(burnlog)/burnlog/session/page.tsx`

**Interfaces:**
- Consumes: `useCurrentProfile()`, `workoutPlanQuery`, `dateSessionQuery` (Task 3).

- [ ] **Step 1: Replace the profile fetch**

Change the import block:

```tsx
'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
```

to:

```tsx
'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { workoutPlanQuery, dateSessionQuery } from '@/lib/burnlog/queries';
```

Change:

```tsx
export default function SessionsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [day, setDay] = useState<number>(new Date().getDay());
  const [logging, setLogging] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<'day' | 'month' | 'program'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [ringsRefreshKey, setRingsRefreshKey] = useState(0);

  // 1️⃣ Get the current auth user (cheap — no DB round trip)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, [supabase]);

  // 2️⃣ Profile + lifestyle/water settings, cached across tab switches
  const { data: profileData } = useSWR(
    userId ? ['burnlog-session-profile', userId] : null,
    async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, lifestyle, currentStreak, waterUnit, glassSizeMl, waterGoalMl')
        .eq('userId', userId!)
        .single();
      return data;
    }
  );
  const profileId: string | null = profileData?.id ?? null;
  const lifestyle = (profileData?.lifestyle as LifestyleAnswers | null) ?? null;
  const currentStreak = profileData?.currentStreak ?? 0;
  const waterUnit = (profileData?.waterUnit as 'glasses' | 'liters') ?? 'glasses';
  const glassSizeMl = profileData?.glassSizeMl ?? 250;
  const waterGoalMl = profileData?.waterGoalMl ?? 2000;

  // 3️⃣ Plan for the selected weekday, cached per (profile, day)
  const { data: planData, isLoading: loadingPlan, mutate: mutatePlan } = useSWR<PlanDay | null>(
    profileId ? ['burnlog-workout-plan', profileId, day] : null,
    async () => {
      const { data } = await supabase
        .from('workout_plans')
        .select('dayOfWeek, bodyPart, repeatWeekly')
        .eq('profileId', profileId!)
        .eq('dayOfWeek', day)
        .single();
      return data ? { dayIndex: data.dayOfWeek, bodyPart: data.bodyPart, repeatWeekly: data.repeatWeekly } : null;
    }
  );
  const plan = planData ?? null;

  // 3️⃣-B The logged session for the selected date (non-today dates only)
  const today = new Date();
  const wantsDateSession = !!profileId && !isSameLocalDay(selectedDate, today);
  const { data: dateSessionData } = useSWR(
    wantsDateSession ? ['burnlog-date-session', profileId, toLocalDateString(selectedDate)] : null,
    async () => {
      const { data } = await supabase
        .from('sessions')
        .select('sessionData')
        .eq('profileId', profileId!)
        .eq('date', toLocalDateString(selectedDate))
        .maybeSingle();
      return data ? (data.sessionData as { completed: boolean; bodyPart?: string; duration?: number; notes?: string }) : null;
    }
  );
  const dateSession = wantsDateSession ? (dateSessionData ?? null) : null;
```

to:

```tsx
export default function SessionsPage() {
  const router = useRouter();
  const [day, setDay] = useState<number>(new Date().getDay());
  const [logging, setLogging] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [view, setView] = useState<'day' | 'month' | 'program'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [ringsRefreshKey, setRingsRefreshKey] = useState(0);

  // 1️⃣ Profile + lifestyle/water settings — shared cache across every app page
  const { profile: profileData, loading: profileLoading } = useCurrentProfile();
  const profileId: string | null = profileData?.id ?? null;
  const lifestyle = (profileData?.lifestyle as LifestyleAnswers | null) ?? null;
  const currentStreak = (profileData?.currentStreak as number | undefined) ?? 0;
  const waterUnit = (profileData?.waterUnit as 'glasses' | 'liters' | undefined) ?? 'glasses';
  const glassSizeMl = (profileData?.glassSizeMl as number | undefined) ?? 250;
  const waterGoalMl = (profileData?.waterGoalMl as number | undefined) ?? 2000;

  // 2️⃣ Plan for the selected weekday, cached per (profile, day) — same key
  // the BottomNav preloader warms via workoutPlanQuery, see Task 8
  const { data: planData, isLoading: loadingPlanFetch, mutate: mutatePlan } = useSWR<PlanDay | null>(
    profileId ? workoutPlanQuery(profileId, day).key : null,
    profileId ? workoutPlanQuery(profileId, day).fetcher : null
  );
  const plan = planData ?? null;
  const loadingPlan = profileLoading || loadingPlanFetch;

  // 2️⃣-B The logged session for the selected date (non-today dates only)
  const today = new Date();
  const wantsDateSession = !!profileId && !isSameLocalDay(selectedDate, today);
  const { data: dateSessionData } = useSWR(
    wantsDateSession ? dateSessionQuery(profileId!, toLocalDateString(selectedDate)).key : null,
    wantsDateSession ? dateSessionQuery(profileId!, toLocalDateString(selectedDate)).fetcher : null
  );
  const dateSession = wantsDateSession ? (dateSessionData ?? null) : null;
```

The `handleSaved` upsert function still needs a Supabase client — add it back locally where it's used:

```tsx
  // 4️⃣ Upsert a new plan
  const handleSaved = async (newPlan: PlanDay & { repeatWeekly: boolean }) => {
    if (!profileId) return;
    const { error } = await supabase
```

to:

```tsx
  // 3️⃣ Upsert a new plan
  const handleSaved = async (newPlan: PlanDay & { repeatWeekly: boolean }) => {
    if (!profileId) return;
    const supabase = createClient();
    const { error } = await supabase
```

Everything from `// 5️⃣ Session logger` (now effectively `// 4️⃣`, comment numbers are cosmetic and don't need renumbering) onward is unchanged — `plan`, `profileId`, `lifestyle`, `currentStreak`, `waterUnit`, `glassSizeMl`, `waterGoalMl`, `loadingPlan`, `dateSession` all still exist with the same names and types.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "session/page"` — expect no output.
Run: `npx eslint "app/(burnlog)/burnlog/session/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(burnlog)/burnlog/session/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: session page shares useCurrentProfile instead of its own key

'burnlog-session-profile' duplicated a subset of the profiles row
useCurrentProfile() already fetches and caches globally. Plan/date-session
fetches now come from the shared queries.ts registry too, so the BottomNav
preloader (Task 8) can warm the exact same cache entries this page reads.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 7: Convert `MealPlannerFlow.tsx` to `useCurrentProfile`

This is the "deep page" from the spec's scope table. It needs no new registry entry — it only ever reads `id` and `lifestyle`, both already on the profile row `useCurrentProfile()` fetches. Once `BottomNav` calls `useCurrentProfile()` (Task 8), that single global cache entry already covers this page too — no separate preload call needed for it.

**Files:**
- Modify: `app/(burnlog)/burnlog/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes: `useCurrentProfile()` from `lib/useCurrentProfile.ts`.

- [ ] **Step 1: Add the import**

```tsx
import { createClient } from '@/lib/supabase/client';
```

stays (still used elsewhere in the file for saving the generated plan) — add below it:

```tsx
import { useCurrentProfile } from '@/lib/useCurrentProfile';
```

- [ ] **Step 2: Replace the entry-fetch effect**

Change:

```tsx
export function MealPlannerFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<WizardStep>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [answers, setAnswers] = useState<Partial<MealPlannerWizardAnswers>>({});
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MealCandidate[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<MealCandidate[]>([]);
  const [grid, setGrid] = useState<MealGridCell[]>([]);
  const [groceryList, setGroceryList] = useState<Record<string, string[]> | null>(null);
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, lifestyle')
        .eq('userId', user.id)
        .single();

      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      const lifestyle = (profile.lifestyle ?? null) as LifestyleAnswers | null;
      setInitialLifestyle(lifestyle);

      // A search deep-link (e.g. "set your favorite meals") jumps straight
      // to the preferences step, skipping store/household — those need a
      // safe fallback since there's no way to revisit them later in this
      // wizard.
      const jumpToPreferences = searchParams.get('step') === 'preferences';

      setAnswers((prev) => ({
        ...prev,
        ...(jumpToPreferences ? { store: 'Other', onHandIngredients: [] } : {}),
        mealsPerDay: lifestyle?.nutrition?.mealsPerDay ?? 3,
        householdSize: lifestyle?.mealPlanning?.householdSize ?? 1,
        cookMode: lifestyle?.mealPlanning?.cookMode ?? 'fresh_daily',
        cuisinePreferences: lifestyle?.mealPlanning?.cuisinePreferences ?? [],
        surpriseMe: lifestyle?.mealPlanning?.surpriseMe ?? false,
        appliances: lifestyle?.mealPlanning?.kitchenAppliances,
      }));
      setStep(jumpToPreferences ? 'preferences' : 'store');
    })();
  }, [supabase, router, searchParams]);
```

to:

```tsx
export function MealPlannerFlow() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { profile, loading: profileLoading } = useCurrentProfile();

  const [step, setStep] = useState<WizardStep>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [answers, setAnswers] = useState<Partial<MealPlannerWizardAnswers>>({});
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MealCandidate[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<MealCandidate[]>([]);
  const [grid, setGrid] = useState<MealGridCell[]>([]);
  const [groceryList, setGroceryList] = useState<Record<string, string[]> | null>(null);
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const { toast } = useToast();

  // Auth/profile-existence redirects already happen in middleware.ts for
  // every non-public route, including this one — this effect only seeds
  // the wizard's initial state once the (already-cached, likely already
  // warm) profile arrives. Guarded on `step === 'loading'` so a background
  // SWR revalidation of the profile later doesn't reset wizard progress
  // the user has already made.
  useEffect(() => {
    if (step !== 'loading' || profileLoading || !profile) return;

    setProfileId(profile.id);
    const lifestyle = (profile.lifestyle ?? null) as LifestyleAnswers | null;
    setInitialLifestyle(lifestyle);

    // A search deep-link (e.g. "set your favorite meals") jumps straight
    // to the preferences step, skipping store/household — those need a
    // safe fallback since there's no way to revisit them later in this
    // wizard.
    const jumpToPreferences = searchParams.get('step') === 'preferences';

    setAnswers((prev) => ({
      ...prev,
      ...(jumpToPreferences ? { store: 'Other', onHandIngredients: [] } : {}),
      mealsPerDay: lifestyle?.nutrition?.mealsPerDay ?? 3,
      householdSize: lifestyle?.mealPlanning?.householdSize ?? 1,
      cookMode: lifestyle?.mealPlanning?.cookMode ?? 'fresh_daily',
      cuisinePreferences: lifestyle?.mealPlanning?.cuisinePreferences ?? [],
      surpriseMe: lifestyle?.mealPlanning?.surpriseMe ?? false,
      appliances: lifestyle?.mealPlanning?.kitchenAppliances,
    }));
    setStep(jumpToPreferences ? 'preferences' : 'store');
  }, [step, profile, profileLoading, searchParams]);
```

`router` is removed from this destructure only if nothing else in the file uses it — check with:

Run: `grep -n "router\." "app/(burnlog)/burnlog/meal-planner/_components/MealPlannerFlow.tsx"`

If any other line in the file still calls `router.something(...)`, keep the `const router = useRouter();` line and the `useRouter` import; only the two `router.replace(...)` calls inside this specific effect are removed. (Based on the file's structure — a multi-step wizard that likely navigates away with `router.push` on completion — expect `router` to still be used elsewhere; don't remove the import/declaration unless the grep comes back empty.)

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "MealPlannerFlow"` — expect no output.
Run: `npx eslint "app/(burnlog)/burnlog/meal-planner/_components/MealPlannerFlow.tsx"` — expect no output.

- [ ] **Step 4: Manual verification**

Run the dev server, sign in, navigate to `/burnlog/meal-planner` directly (fresh load) and confirm the wizard still starts on the `store` step (or `preferences` if visited with `?step=preferences`) exactly as before. Then, from the `store` step, wait a few seconds (long enough for `useCurrentProfile`'s `dedupingInterval` to allow a revalidation) and confirm the step does **not** reset to `store` from further into the wizard — this is the regression the `step === 'loading'` guard exists to prevent.

- [ ] **Step 5: Commit**

```bash
git add "app/(burnlog)/burnlog/meal-planner/_components/MealPlannerFlow.tsx"
git commit -m "$(cat <<'EOF'
refactor: meal planner wizard seeds from useCurrentProfile

Drops its own auth.getUser()+profiles fetch (middleware.ts already
redirects unauthenticated/profile-less users for this route) in favor of
the shared, already-cached profile row. Guarded so a background profile
revalidation can't reset in-progress wizard state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 8: Wire `usePreloadRoutes` into `BottomNav`

**Files:**
- Modify: `components/BottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (Task 1), `useCurrentProfile()`, `fitnessGoalsQuery`/`workoutPlanQuery` (Task 3).

- [ ] **Step 1: Add the preload call**

Current file:

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
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/burnlog/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/burnlog/session',   label: 'Plan', Icon: DumbbellIcon },
  { href: '/burnlog/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/burnlog/insights',  label: 'Insights', Icon: ChartLine },
];

export function BottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/burnlog/dashboard/config' || pathname.startsWith('/burnlog/dashboard/config/');

  return (
```

Change to:

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
import { ConfigMenu } from '@/components/ConfigMenu';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { fitnessGoalsQuery, workoutPlanQuery } from '@/lib/burnlog/queries';

const tabs = [
  { href: '/burnlog/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/burnlog/session',   label: 'Plan', Icon: DumbbellIcon },
  { href: '/burnlog/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/burnlog/insights',  label: 'Insights', Icon: ChartLine },
];

export function BottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/burnlog/dashboard/config' || pathname.startsWith('/burnlog/dashboard/config/');

  // Warms the caches Dashboard, Goals, and Session read from (Insights
  // stays server-rendered — see the spec's "out of scope" note — so it
  // isn't preloadable via this mechanism) so switching tabs after this nav
  // has been mounted a moment renders from cache instead of a fresh fetch.
  const { profile } = useCurrentProfile();
  const today = new Date().getDay();
  usePreloadRoutes(
    profile
      ? [fitnessGoalsQuery(profile.id), workoutPlanQuery(profile.id, today)]
      : []
  );

  return (
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "components/BottomNav"` — expect no output.
Run: `npx eslint components/BottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, and land on `/burnlog/dashboard`. Wait ~1 second (past the idle callback), then tap the "Goals" and "Plan" tabs in sequence. Confirm: no new `fitness_goals`/`workout_plans` request fires for either tab (the preload already populated those SWR keys), and both render with no loading skeleton flash.

- [ ] **Step 4: Commit**

```bash
git add components/BottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: BottomNav preloads sibling tabs' data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 9: `loading.tsx` for BurnLog + full verification pass

**Files:**
- Create: `app/(burnlog)/burnlog/loading.tsx`

Placed at the `(burnlog)/burnlog/` segment (not deeper), this becomes the Suspense fallback for every route under `/burnlog/*` that doesn't define its own more specific `loading.tsx` — which is all of them today. This is what upgrades `prefetch` on dynamic BurnLog routes from a partial (static-shell-only) prefetch to a full one, per Next.js's documented `loading.tsx` behavior.

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(burnlog)/burnlog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function BurnLogLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
```

This mirrors the shape of the skeleton blocks already used inline in `dashboard/page.tsx`, `session/page.tsx`, and `goals/page.tsx` (same `Skeleton` component, same rough proportions) — it's a generic loading shell, not meant to pixel-match any one page.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "burnlog/loading"` — expect no output.
Run: `npx eslint "app/(burnlog)/burnlog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server with network throttled (Chrome DevTools → Network → Slow 3G), sign in, and:
- Navigate directly to `/burnlog/session` via URL bar (hard navigation, no prior prefetch). Confirm `BurnLogLoading` renders briefly instead of a blank page.
- From `/burnlog/dashboard`, click the "Plan" tab. Confirm the transition still uses the fade/slide from `app/(burnlog)/layout.tsx` (added earlier this session) and doesn't regress — `loading.tsx` and that layout-level `AnimatePresence` transition are independent mechanisms and should coexist without conflict.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo (not just grepped subsets — this catches any cross-file break Tasks 1–9 might have introduced).
Run: `npx eslint "app/(burnlog)/**/*.tsx" "lib/burnlog/**/*.ts" "lib/usePreloadRoutes.ts" components/ConfigMenu.tsx components/ProfileMenu.tsx components/BottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + the 9 new tests from Task 3).

- [ ] **Step 5: Commit**

```bash
git add "app/(burnlog)/burnlog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /burnlog/* so prefetch fully warms dynamic routes

Zero loading.tsx files existed anywhere in the app before this — without
one, Next only partially prefetches a dynamic route's RSC payload, so
Link prefetch (and this session's BottomNav data preload) was warming
less than it looked like.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** shared idle-preload mechanism (Task 1), code-prefetch on shared nav (`ConfigMenu`/`ProfileMenu` in Task 2; BurnLog's own `BottomNav` Link `prefetch` was already added in an earlier session and isn't touched again here), query registry pattern (Task 3), BurnLog nav tabs converted (Tasks 4–6 cover dashboard/goals/session; insights is explicitly out of scope per the spec's server-component reasoning), BurnLog's one deep page converted (Task 7 — meal-planner), preload wiring (Task 8), `loading.tsx` (Task 9). The spec's explicitly-deferred items (middleware rework, the other 8 apps) are correctly absent from this plan, matching the "Foundation + BurnLog first" scope decision.
- **Two real bugs found and fixed as part of this plan, not left as latent debt:** `goals/page.tsx` and `dashboard/page.tsx` were independently fetching identical data under different SWR keys (Task 5); `session/page.tsx` was independently re-fetching a subset of the profile row `useCurrentProfile` already owns (Task 6). Both are fixed by construction once the registry exists, not as a bolted-on follow-up.
- **Type consistency check:** `FitnessGoal.targetValue` is `number` (not `number | string`) across `queries.ts`, `dashboard/page.tsx`, and `goals/page.tsx` — traced the one call site that mattered (`Number(weightGoal.targetValue)` in dashboard) and confirmed it's a safe no-op on an already-`number` value. `WorkoutPlanDay`/`DateSession` names and shapes match between `queries.ts` (Task 3) and their consumption in `session/page.tsx` (Task 6) exactly.
