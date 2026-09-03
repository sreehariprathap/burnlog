# Nav Preloading — TravelLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to TravelLog: nav-link prefetch, a query registry, converting TravelLog's data-bearing nav tabs to it, wiring the preload into `TravelLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as the three prior apps. TravelLog's specific issue: `app/(travellog)/travellog/page.tsx` (Home) and `app/(travellog)/travellog/map/page.tsx` (Map) each contain a **verbatim-duplicated** `fetchVisits(profileId)` function — identical body, identical SWR key (`['travellog-visits', profileId]`) — copy-pasted into two files instead of shared. Not a cache-drift bug like BurnLog/MoneyLog had (the keys already match, so SWR already dedupes the actual network calls), but it is the same root cause the registry is meant to eliminate: the same query logic living in two places that could silently diverge later. `trips/page.tsx` already uses a clean, registry-ready API-route key. `suggestions/page.tsx` has one simple, convertible list fetch (`weeklySuggestions`) and one more complex composite computation (free-time windows + holidays + spending surplus) that stays out of scope — see Task 1's note.

**Tech Stack:** Next.js App Router, `swr@2.5.1`, Supabase JS client, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-tasklog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: `` [`${app}-${resource}`, profileId] `` — this app already follows it for the visits key (`'travellog-visits'`); the registry keeps that exact string unchanged. `tripsQuery()` is the string-key exception (matches MoneyLog's `assetsQuery()` pattern — the API route scopes by session server-side, no profileId needed in the key).
- Zero `.tsx` component tests exist in this repo. **Known gotcha, already hit once in the MoneyLog plan:** `tripsQuery()`'s fetcher calls `apiFetch` (`lib/apiFetch.ts`), which transitively imports `components/ui/use-toast.tsx` — a real `.tsx` file this repo's Vitest setup has never needed to transform. Its test file MUST `vi.mock('@/lib/apiFetch', ...)` before importing `./queries`, exactly like `lib/moneylog/queries.test.ts` does. Skipping this reproduces the exact JSX-parse failure documented in that plan.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.

---

## File Structure

New files:
- `lib/travellog/queries.ts` — TravelLog's query registry: `visitsQuery`, `tripsQuery`, `weeklySuggestionsQuery`.
- `lib/travellog/queries.test.ts` — Vitest coverage for all three fetchers/factories.
- `app/(travellog)/travellog/loading.tsx` — Suspense fallback for `/travellog/*`.

Modified files:
- `components/TravelLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(travellog)/travellog/page.tsx` (Home) — consume `visitsQuery` instead of its own copy of `fetchVisits`.
- `app/(travellog)/travellog/map/page.tsx` — consume `visitsQuery` instead of its own (duplicate) copy of `fetchVisits`.
- `app/(travellog)/travellog/trips/page.tsx` — consume `tripsQuery` instead of its own inline key/fetcher.
- `app/(travellog)/travellog/suggestions/page.tsx` — consume `weeklySuggestionsQuery` instead of its own uncached `useEffect` fetch for the weekly-suggestions list. The page's other effect (free-time windows / holidays / spending-surplus composite) stays as-is — explained in Task 1's note.

Explicitly NOT modified:
- `app/(travellog)/travellog/plan/page.tsx` — this tab is an AI-generation form (trip intake → itinerary review), not a list/lookup page; it reads `useCurrentProfile()` and `searchParams` but has no page-level Supabase query of its own to register. It still gets `prefetch` (Task 5) and benefits from `loading.tsx` (Task 6) like every other route.
- `suggestions/page.tsx`'s free-time/holidays/surplus computation — four parallel calls (two Supabase queries, an external holidays fetch, and a `computeAverageMonthlySurplus` helper) feeding a derived computation (`computeFreeWindows`), not a simple list fetch. Converting it is real, valuable follow-up work but a bigger, riskier refactor than this plan's scope — same judgment call as BurnLog's `useFinanceData` and MoneyLog's period-scoped home data in the prior two plans.

---

## Task 1: TravelLog query registry

**Files:**
- Create: `lib/travellog/queries.ts`
- Test: `lib/travellog/queries.test.ts`

**Interfaces:**
- Consumes: `TravelVisitRow` (existing, `lib/travellog/types.ts`), `TripCardItem` (existing, `components/travellog/WeeklyTripStack.tsx`).
- Produces:
  - `fetchVisits(supabase: SupabaseClient, profileId: string): Promise<TravelVisitRow[]>`
  - `visitsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<TravelVisitRow[]> }`
  - `type TripSummary = { id: string; destination: string; startDate: string; endDate: string; status: string; myRole: 'owner' | 'member' }`
  - `fetchTrips(): Promise<{ plans: TripSummary[] }>`
  - `tripsQuery(): { key: string; fetcher: () => Promise<{ plans: TripSummary[] }> }`
  - `fetchWeeklySuggestions(supabase: SupabaseClient, profileId: string): Promise<TripCardItem[]>`
  - `weeklySuggestionsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<TripCardItem[]> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/travellog/queries.ts
//
// Single source of truth for TravelLog's preloadable page queries — same
// pattern as the burnlog/moneylog/tasklog registries. `visitsQuery` in
// particular replaces a fetchVisits() function that was copy-pasted
// verbatim into both page.tsx (Home) and map/page.tsx before this file
// existed — same SWR key in both (so no double-fetch bug), but the same
// query logic duplicated across two files instead of shared.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import type { TravelVisitRow } from '@/lib/travellog/types';
import type { TripCardItem } from '@/components/travellog/WeeklyTripStack';

export async function fetchVisits(supabase: SupabaseClient, profileId: string): Promise<TravelVisitRow[]> {
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export function visitsQuery(profileId: string) {
  return {
    key: ['travellog-visits', profileId] as const,
    fetcher: () => fetchVisits(createClient(), profileId),
  };
}

export type TripSummary = {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  myRole: 'owner' | 'member';
};

export async function fetchTrips(): Promise<{ plans: TripSummary[] }> {
  const res = await apiFetch('/api/travellog/plans');
  if (!res.ok) throw new Error('Failed to load trips');
  return res.json();
}

export function tripsQuery() {
  return {
    key: '/api/travellog/plans',
    fetcher: fetchTrips,
  };
}

export async function fetchWeeklySuggestions(supabase: SupabaseClient, profileId: string): Promise<TripCardItem[]> {
  const { data } = await supabase
    .from('travellog_weekly_suggestions')
    .select('id, destination, country, startDate, endDate, windowLabel, reason')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: true });
  return (data as TripCardItem[]) ?? [];
}

export function weeklySuggestionsQuery(profileId: string) {
  return {
    key: ['travellog-weekly-suggestions', profileId] as const,
    fetcher: () => fetchWeeklySuggestions(createClient(), profileId),
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/travellog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// fetchTrips calls apiFetch (lib/apiFetch.ts), which transitively imports
// components/ui/use-toast.tsx for its error-toast side effect — a real
// .tsx file this repo's Vitest setup has never needed to transform.
// Mocking the module before `./queries` imports it keeps that file out of
// the test's module graph entirely (same fix as lib/moneylog/queries.test.ts).
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const { fetchVisits, fetchTrips, fetchWeeklySuggestions, visitsQuery, tripsQuery, weeklySuggestionsQuery } =
  await import('./queries');

// Same thenable-and-chainable mock shape as the other three registries.
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const order = vi.fn().mockReturnValue(makeThenable({}));
  const eqChain = makeThenable({ order });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqChain) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchVisits', () => {
  it('returns the profile\'s visits ordered by arrival date', async () => {
    const visits = [{ id: 'v1', placeName: 'Lisbon', country: 'Portugal', arrivalDate: '2026-05-01' }];
    const supabase = fakeSupabase({ data: visits, error: null });
    const result = await fetchVisits(supabase, 'profile-1');
    expect(result).toEqual(visits);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchVisits(supabase, 'profile-1')).rejects.toThrow('boom');
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchVisits(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchTrips', () => {
  it('returns the parsed trips payload on success', async () => {
    const payload = { plans: [{ id: 'p1', destination: 'Tokyo', startDate: '2026-10-01', endDate: '2026-10-10', status: 'planned', myRole: 'owner' }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchTrips();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchTrips()).rejects.toThrow('Failed to load trips');
  });
});

describe('fetchWeeklySuggestions', () => {
  it('returns the profile\'s weekly trip suggestions', async () => {
    const suggestions = [{ id: 's1', destination: 'Kyoto', country: 'Japan', startDate: '2026-09-10', endDate: '2026-09-12', windowLabel: 'This weekend', reason: 'Free days + good weather' }];
    const supabase = fakeSupabase({ data: suggestions, error: null });
    const result = await fetchWeeklySuggestions(supabase, 'profile-1');
    expect(result).toEqual(suggestions);
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchWeeklySuggestions(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('registry key shapes', () => {
  it('visitsQuery keys by app+resource+profileId', () => {
    expect(visitsQuery('profile-1').key).toEqual(['travellog-visits', 'profile-1']);
  });

  it('tripsQuery keys by the API route path (session-scoped server-side)', () => {
    expect(tripsQuery().key).toBe('/api/travellog/plans');
  });

  it('weeklySuggestionsQuery keys by app+resource+profileId', () => {
    expect(weeklySuggestionsQuery('profile-1').key).toEqual(['travellog-weekly-suggestions', 'profile-1']);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/travellog/queries.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/travellog/queries"` — expect no output.
Run: `npx eslint lib/travellog/queries.ts lib/travellog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/travellog/queries.ts lib/travellog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add TravelLog query registry (visits, trips, weekly suggestions)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (Home) and `map/page.tsx` to `visitsQuery`

Both pages get the same change — de-duplicating the copy-pasted `fetchVisits` into one registry import.

**Files:**
- Modify: `app/(travellog)/travellog/page.tsx`
- Modify: `app/(travellog)/travellog/map/page.tsx`

**Interfaces:**
- Consumes: `visitsQuery` (Task 1).

- [ ] **Step 1: Update `page.tsx` (Home)**

Change:

```tsx
// app/(travellog)/travellog/page.tsx
'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';

async function fetchVisits(profileId: string): Promise<TravelVisitRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export default function TravelLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data: visits, isLoading } = useSWR(
    profile ? ['travellog-visits', profile.id] : null,
    () => fetchVisits(profile!.id)
  );
```

to:

```tsx
// app/(travellog)/travellog/page.tsx
'use client';

import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored } from '@/lib/travellog/types';
import { visitsQuery } from '@/lib/travellog/queries';

export default function TravelLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data: visits, isLoading } = useSWR(
    profile ? visitsQuery(profile.id).key : null,
    profile ? visitsQuery(profile.id).fetcher : null
  );
```

(`TravelVisitRow` is no longer referenced directly in this file once the local `fetchVisits` is removed — dropped from the import. `isExplored` stays, still used below in `exploredCount`.)

- [ ] **Step 2: Update `map/page.tsx`**

Change:

```tsx
// app/(travellog)/travellog/map/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';
import { LogVisitDrawer } from './_components/LogVisitDrawer';
import WorldMap from '@/components/ui/world-map';

async function fetchVisits(profileId: string): Promise<TravelVisitRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export default function TravelLogMapPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: visits, isLoading, mutate } = useSWR(
    profile ? ['travellog-visits', profile.id] : null,
    () => fetchVisits(profile!.id)
  );
```

to:

```tsx
// app/(travellog)/travellog/map/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored } from '@/lib/travellog/types';
import { visitsQuery } from '@/lib/travellog/queries';
import { LogVisitDrawer } from './_components/LogVisitDrawer';
import WorldMap from '@/components/ui/world-map';

export default function TravelLogMapPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: visits, isLoading, mutate } = useSWR(
    profile ? visitsQuery(profile.id).key : null,
    profile ? visitsQuery(profile.id).fetcher : null
  );
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "\(travellog\)/travellog/page|travellog/map/page"` — expect no output.
Run: `npx eslint "app/(travellog)/travellog/page.tsx" "app/(travellog)/travellog/map/page.tsx"` — expect no output.

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/travellog/page.tsx" "app/(travellog)/travellog/map/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: Home and Map pages share visitsQuery instead of a duplicated fetchVisits

Both pages had their own copy-pasted fetchVisits() with the same SWR key —
no double-fetch bug (SWR already dedupes by key), but the same query logic
duplicated across two files instead of shared through the registry.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `trips/page.tsx` to `tripsQuery`

**Files:**
- Modify: `app/(travellog)/travellog/trips/page.tsx`

**Interfaces:**
- Consumes: `tripsQuery`, `type TripSummary` (Task 1).

- [ ] **Step 1: Swap the inline key/fetcher for the registry entry**

Change:

```tsx
// app/(travellog)/travellog/trips/page.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/apiFetch';

interface TripSummary {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  myRole: 'owner' | 'member';
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trips');
  return res.json();
}

export default function TravelLogTripsPage() {
  const { data, isLoading } = useSWR<{ plans: TripSummary[] }>('/api/travellog/plans', fetcher);
```

to:

```tsx
// app/(travellog)/travellog/trips/page.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { tripsQuery, type TripSummary } from '@/lib/travellog/queries';

export default function TravelLogTripsPage() {
  const { data, isLoading } = useSWR<{ plans: TripSummary[] }>(tripsQuery().key, tripsQuery().fetcher);
```

Check whether `TripSummary` is referenced anywhere else below this line (likely yes, typing `.map((plan: TripSummary) => ...)` further down) — the import swap keeps it available under the same name either way.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "travellog/trips/page"` — expect no output.
Run: `npx eslint "app/(travellog)/travellog/trips/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/travellog/trips/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: trips page consumes shared tripsQuery registry entry

Same key/fetcher as before ('/api/travellog/plans') — this only moves it
into the registry so the nav preloader (Task 5) can warm it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `suggestions/page.tsx`'s weekly-suggestions fetch to `weeklySuggestionsQuery`

The free-time/holidays/surplus composite effect (the page's other `useEffect`, lines 44–84 in the original file) is untouched — see this plan's "Explicitly NOT modified" note.

**Files:**
- Modify: `app/(travellog)/travellog/suggestions/page.tsx`

**Interfaces:**
- Consumes: `weeklySuggestionsQuery` (Task 1).

- [ ] **Step 1: Replace the weekly-suggestions effect**

Change:

```tsx
import { computeFreeWindows, type FreeWindow } from '@/lib/travellog/freeTime';
import { computeAverageMonthlySurplus } from '@/lib/travellog/affordability';
import { fetchUpcomingHolidays, type Holiday } from '@/lib/travellog/holidays';
import type { TripSuggestion } from '@/lib/travellog/suggestions';
import { WeeklyTripStack, type TripCardItem } from '@/components/travellog/WeeklyTripStack';
```

to:

```tsx
import useSWR from 'swr';
import { computeFreeWindows, type FreeWindow } from '@/lib/travellog/freeTime';
import { computeAverageMonthlySurplus } from '@/lib/travellog/affordability';
import { fetchUpcomingHolidays, type Holiday } from '@/lib/travellog/holidays';
import type { TripSuggestion } from '@/lib/travellog/suggestions';
import { WeeklyTripStack, type TripCardItem } from '@/components/travellog/WeeklyTripStack';
import { weeklySuggestionsQuery } from '@/lib/travellog/queries';
```

Change:

```tsx
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [freeWindows, setFreeWindows] = useState<FreeWindow[]>([]);
  const [surplus, setSurplus] = useState(0);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [suggestions, setSuggestions] = useState<TripSuggestion[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [weeklySuggestions, setWeeklySuggestions] = useState<TripCardItem[]>([]);
```

to:

```tsx
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [freeWindows, setFreeWindows] = useState<FreeWindow[]>([]);
  const [surplus, setSurplus] = useState(0);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [suggestions, setSuggestions] = useState<TripSuggestion[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: weeklySuggestions = [] } = useSWR<TripCardItem[]>(
    profile ? weeklySuggestionsQuery(profile.id).key : null,
    profile ? weeklySuggestionsQuery(profile.id).fetcher : null
  );
```

Remove the now-redundant second effect entirely:

```tsx
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('travellog_weekly_suggestions')
        .select('id, destination, country, startDate, endDate, windowLabel, reason')
        .eq('profileId', profile.id)
        .order('createdAt', { ascending: true });

      if (!cancelled) {
        setWeeklySuggestions((data as TripCardItem[]) || []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, supabase]);
```

The first `useEffect` (free windows / holidays / surplus, using `supabase` for `myday_blocks` and `tasklog_tasks`) is unchanged — `supabase` stays in scope for it, and `handleGenerate` further down doesn't touch Supabase at all (it's a plain `fetch` to an AI route), so no other cleanup is needed.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "suggestions/page"` — expect no output.
Run: `npx eslint "app/(travellog)/travellog/suggestions/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/travellog/suggestions/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: suggestions page's weekly-suggestions list consumes weeklySuggestionsQuery

The free-time/holidays/surplus composite effect on this page stays as-is
— a derived multi-source computation, not a simple list fetch; see the
plan's "Explicitly NOT modified" note.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Prefetch + preload wiring in `TravelLogBottomNav`

**Files:**
- Modify: `components/TravelLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `useCurrentProfile()`, `visitsQuery`/`tripsQuery`/`weeklySuggestionsQuery` (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/TravelLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { MapIcon, UsersIcon, SparklesIcon, PiggyBankIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TravelLogMark } from '@/components/TravelLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/travellog', label: 'Home', Icon: null },
  { href: '/travellog/map', label: 'Map', Icon: MapIcon },
  { href: '/travellog/trips', label: 'Trips', Icon: UsersIcon },
  { href: '/travellog/plan', label: 'Plan', Icon: SparklesIcon },
  { href: '/travellog/suggestions', label: 'Suggest', Icon: PiggyBankIcon },
];

export function TravelLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/travellog/config' || pathname.startsWith('/travellog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/travellog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
```

to:

```tsx
// components/TravelLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { MapIcon, UsersIcon, SparklesIcon, PiggyBankIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TravelLogMark } from '@/components/TravelLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { visitsQuery, tripsQuery, weeklySuggestionsQuery } from '@/lib/travellog/queries';

const tabs = [
  { href: '/travellog', label: 'Home', Icon: null },
  { href: '/travellog/map', label: 'Map', Icon: MapIcon },
  { href: '/travellog/trips', label: 'Trips', Icon: UsersIcon },
  { href: '/travellog/plan', label: 'Plan', Icon: SparklesIcon },
  { href: '/travellog/suggestions', label: 'Suggest', Icon: PiggyBankIcon },
];

export function TravelLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/travellog/config' || pathname.startsWith('/travellog/config/');

  // Warms Home/Map (shared visitsQuery), Trips, and Suggestions' weekly
  // list. Plan has no page-level query to preload (an AI-generation form,
  // not a list/lookup page — see the plan's "Explicitly NOT modified" note).
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [visitsQuery(profile.id), tripsQuery(), weeklySuggestionsQuery(profile.id)]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/travellog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={isActive ? 'page' : undefined}
            className={cn(
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "TravelLogBottomNav"` — expect no output.
Run: `npx eslint components/TravelLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, land on `/travellog`. Wait ~1 second, then tap "Map", "Trips", and "Suggest" in sequence. Confirm: no new `travellog_visits`/`/api/travellog/plans`/`travellog_weekly_suggestions` request fires for any of them, and all render with no loading skeleton flash for those specific queries (Suggestions' free-time/holidays/surplus signals still load fresh each visit — that's the explicitly out-of-scope part, not a bug).

- [ ] **Step 4: Commit**

```bash
git add components/TravelLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: TravelLogBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: `loading.tsx` for TravelLog + full verification pass

**Files:**
- Create: `app/(travellog)/travellog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(travellog)/travellog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function TravelLogLoading() {
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

Same generic shape as the prior three apps' `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "travellog/loading"` — expect no output.
Run: `npx eslint "app/(travellog)/travellog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/travellog/map` via URL bar, confirm `TravelLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(travellog)/**/*.tsx" "lib/travellog/**/*.ts" components/TravelLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(travellog)/travellog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /travellog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** all five TravelLog nav tabs addressed — four converted to the registry or given prefetch-only treatment where no page-level query exists (Plan), one deliberately partial (Suggestions, where only the simple list fetch converts). Prefetch + preload wiring (Task 5) and `loading.tsx` (Task 6) mirror the prior three plans.
- **A real duplication found and fixed, not left as latent debt:** `fetchVisits` was copy-pasted verbatim into two files. Not a cache-correctness bug (matching keys meant SWR already deduped the network calls) but exactly the kind of divergence risk the registry exists to prevent — fixed in Task 2, not filed as follow-up.
- **Type consistency check:** `TripSummary` (registry) is identical to the interface `trips/page.tsx` previously declared inline — Task 3 imports it from the registry instead of redeclaring it, and any place the page reads a `TripSummary` field keeps working unchanged. `TripCardItem` (registry's `weeklySuggestionsQuery` return type) is imported from its existing home (`components/travellog/WeeklyTripStack.tsx`) rather than redefined a second time — `suggestions/page.tsx` (Task 4) already imports it from there for its own `useState<TripCardItem[]>`, now redundant with the SWR-typed `weeklySuggestions`, so that state declaration is removed rather than kept as a second source of truth.
