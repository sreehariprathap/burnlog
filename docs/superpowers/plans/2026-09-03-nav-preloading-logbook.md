# Nav Preloading — LogBook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to LogBook — the ninth and final app in this series: nav-link prefetch, a query registry, converting LogBook's two nav tabs to it, wiring the preload into `LogbookBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as the eight prior apps. LogBook has the same duplication pattern TravelLog and ShoppingLog had: `fetchLogbookToday` (fetching `/api/logbook/today`, keyed `'logbook-today'`) is defined byte-for-byte identically in both `page.tsx` (Home) and `morning/page.tsx` (the morning-brief screen, reached from Home's `MorningBrief` teaser card, not itself a nav tab). Unifying both onto one registry entry means `/logbook/morning` gets preloaded "for free" once Home's query is warmed — no separate preload entry needed for it. The other nav tab, MyDay, has a `` `myday-${date}` `` key that defaults to *today's* date whenever the page is opened without a `?date=` search param — the same "parameterized but preloadable for the default/current case" shape as BurnLog's `workoutPlanQuery(profileId, day)`, so it's registered (parameterized by date) rather than excluded as page-internal state.

**Tech Stack:** Next.js App Router, `swr@2.5.1`, plain `fetch` (both fetchers in this registry call their API routes directly with bare `fetch`, not `apiFetch` — so no `.tsx`-import test gotcha applies here, unlike the MoneyLog/TravelLog/ShoppingLog/SocialLog plans).

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged — all 8 other apps):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-tasklog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-travellog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-homelog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-learnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-shoppinglog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-sociallog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: this app already uses plain resource-name strings (`'logbook-today'`) and one date-parameterized string (`` `myday-${date}` ``) — the registry keeps both formats unchanged.
- Zero `.tsx` component tests exist in this repo. Neither fetcher in this registry calls `apiFetch`, so the `.tsx`-import gotcha from four of the eight prior plans does not apply here.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.
- `LogbookBottomNav.tsx` renders its two tabs as **individual inline `<Link>` elements**, not a `tabs.map(...)` loop like every other app's nav — both `<Link>`s need `prefetch` added separately.

---

## File Structure

New files:
- `lib/logbook/queries.ts` — LogBook's query registry: `todayQuery`, `myDayQuery`, plus a shared `todayKey()` date helper.
- `lib/logbook/queries.test.ts` — Vitest coverage for both fetchers/factories and `todayKey()`.
- `app/(logbook)/logbook/loading.tsx` — Suspense fallback for `/logbook/*`.

Modified files:
- `components/LogbookBottomNav.tsx` — add `prefetch` to both inline `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(logbook)/logbook/page.tsx` (Home) — consume `todayQuery` instead of its own local `fetchLogbookToday`.
- `app/(logbook)/logbook/morning/page.tsx` — consume `todayQuery` instead of its own (duplicate) local `fetchLogbookToday`.
- `app/(logbook)/logbook/myday/_components/MyDayClient.tsx` — consume `myDayQuery`/`todayKey` instead of its own local `fetchMyDay`/`todayKey`.

No separate deep-page task is needed — `/logbook/morning` shares Home's exact registry entry once Task 2/3 land, so it's covered without its own preload call.

---

## Task 1: LogBook query registry

**Files:**
- Create: `lib/logbook/queries.ts`
- Test: `lib/logbook/queries.test.ts`

**Interfaces:**
- Consumes: `LogbookToday` (existing, `lib/logbook/today.ts`), `MyDayData` (existing, `lib/myday/types.ts`).
- Produces:
  - `fetchToday(): Promise<LogbookToday>`
  - `todayQuery(): { key: string; fetcher: () => Promise<LogbookToday> }`
  - `todayKey(): string` — `'yyyy-MM-dd'` for the current date, via `date-fns`' `format`.
  - `fetchMyDay(date: string): Promise<MyDayData>`
  - `myDayQuery(date: string): { key: string; fetcher: () => Promise<MyDayData> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/logbook/queries.ts
//
// Single source of truth for LogBook's preloadable page queries — same
// pattern as the eight prior registries. `todayQuery` in particular
// replaces a fetchLogbookToday() function that was copy-pasted verbatim
// into both page.tsx (Home) and morning/page.tsx before this file
// existed — same key in both (so no double-fetch bug), but the same
// query logic duplicated across two files instead of shared. Once both
// consume this entry, /logbook/morning is preloaded "for free" whenever
// Home's query is warmed, with no separate registry entry needed for it.
import { format } from 'date-fns';
import type { LogbookToday } from '@/lib/logbook/today';
import type { MyDayData } from '@/lib/myday/types';

export async function fetchToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

export function todayQuery() {
  return {
    key: 'logbook-today',
    fetcher: fetchToday,
  };
}

/** 'yyyy-MM-dd' for the current date — the default MyDay opens to when no `?date=` is in the URL. */
export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export async function fetchMyDay(date: string): Promise<MyDayData> {
  const res = await fetch(`/api/myday?date=${date}`);
  if (!res.ok) throw new Error('Failed to load MyDay');
  return res.json();
}

export function myDayQuery(date: string) {
  return {
    key: `myday-${date}`,
    fetcher: () => fetchMyDay(date),
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/logbook/queries.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchToday, fetchMyDay, todayQuery, todayKey, myDayQuery } from './queries';

function stubFetchOnce(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchToday', () => {
  it('returns the parsed logbook-today payload on success', async () => {
    const payload = { dayScore: 82, yesterdayScore: 75, lifeScoreMode: 'engagement' };
    stubFetchOnce(payload);
    const result = await fetchToday();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'server error' }) }));
    await expect(fetchToday()).rejects.toThrow('Failed to load logbook data');
  });
});

describe('fetchMyDay', () => {
  it('returns the parsed MyDay payload for the given date', async () => {
    const payload = { date: '2026-09-03', blocks: [], unscheduled: [] };
    stubFetchOnce(payload);
    const result = await fetchMyDay('2026-09-03');
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'server error' }) }));
    await expect(fetchMyDay('2026-09-03')).rejects.toThrow('Failed to load MyDay');
  });
});

describe('todayKey', () => {
  it('formats the current date as yyyy-MM-dd', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('registry key shapes', () => {
  it('todayQuery keys by a plain resource-name string', () => {
    expect(todayQuery().key).toBe('logbook-today');
  });

  it('myDayQuery keys by the date it was called with', () => {
    expect(myDayQuery('2026-09-03').key).toBe('myday-2026-09-03');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/logbook/queries.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/logbook/queries"` — expect no output.
Run: `npx eslint lib/logbook/queries.ts lib/logbook/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/logbook/queries.ts lib/logbook/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add LogBook query registry (today, MyDay)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (Home) to `todayQuery`

**Files:**
- Modify: `app/(logbook)/logbook/page.tsx`

**Interfaces:**
- Consumes: `todayQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
import type { LogbookToday } from '@/lib/logbook/today';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';
import { createClient } from '@/lib/supabase/client';

// Client Component — page metadata (title) is set via the root layout's
// default; add a Metadata export here if this is ever converted to a
// Server Component wrapper.

async function fetchLogbookToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

export default function LogbookPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(profile ? 'logbook-today' : null, fetchLogbookToday);
```

to:

```tsx
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';
import { createClient } from '@/lib/supabase/client';
import { todayQuery } from '@/lib/logbook/queries';

// Client Component — page metadata (title) is set via the root layout's
// default; add a Metadata export here if this is ever converted to a
// Server Component wrapper.

export default function LogbookPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(
    profile ? todayQuery().key : null,
    profile ? todayQuery().fetcher : null
  );
```

(`LogbookToday` is dropped from this file's imports since nothing here names the type directly anymore — `data`'s shape now comes from `todayQuery().fetcher`'s inferred return type. Check with `grep -n "LogbookToday" "app/(logbook)/logbook/page.tsx"` before removing the import — keep it if any other local variable/prop in this file is still explicitly typed as `LogbookToday`.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "\(logbook\)/logbook/page"` — expect no output.
Run: `npx eslint "app/(logbook)/logbook/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(logbook)/logbook/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: LogBook home page consumes shared todayQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `morning/page.tsx` to `todayQuery`

**Files:**
- Modify: `app/(logbook)/logbook/morning/page.tsx`

**Interfaces:**
- Consumes: `todayQuery` (Task 1).

- [ ] **Step 1: Replace the duplicate inline fetcher**

Change:

```tsx
import { dismissMorningBriefToday } from '@/lib/logbook/morningDismiss';
import { formatCalories, formatCurrency } from '@/lib/format';
import type { LogbookToday } from '@/lib/logbook/today';

// Client Component — no static <Metadata> export; this page is reached via
// in-app navigation only, so the parent /logbook title carries over.

async function fetchLogbookToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up early';
  if (hour < 12) return 'Good morning';
  return 'Good afternoon';
}

export default function MorningBriefPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(profile ? 'logbook-today' : null, fetchLogbookToday);
```

to:

```tsx
import { dismissMorningBriefToday } from '@/lib/logbook/morningDismiss';
import { formatCalories, formatCurrency } from '@/lib/format';
import { todayQuery } from '@/lib/logbook/queries';

// Client Component — no static <Metadata> export; this page is reached via
// in-app navigation only, so the parent /logbook title carries over.

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up early';
  if (hour < 12) return 'Good morning';
  return 'Good afternoon';
}

export default function MorningBriefPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(
    profile ? todayQuery().key : null,
    profile ? todayQuery().fetcher : null
  );
```

(Same `LogbookToday` import check as Task 2 — drop it only if nothing else in this file names the type.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "morning/page"` — expect no output.
Run: `npx eslint "app/(logbook)/logbook/morning/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(logbook)/logbook/morning/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: morning brief page shares todayQuery with the home page

De-duplicates a fetchLogbookToday() this page previously copy-pasted
verbatim from page.tsx — same key, same body. Once both consume this
registry entry, /logbook/morning is preloaded for free whenever Home's
query is warmed (Task 5), with no separate preload entry needed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `MyDayClient.tsx` to `myDayQuery`/`todayKey`

**Files:**
- Modify: `app/(logbook)/logbook/myday/_components/MyDayClient.tsx`

**Interfaces:**
- Consumes: `myDayQuery`, `todayKey` (Task 1).

- [ ] **Step 1: Replace the local fetcher and date helper**

Change:

```tsx
import type { MyDayBlock, MyDayData, MyDayUnscheduledItem } from '@/lib/myday/types';

function todayKey(): string {
  return formatDate(new Date(), 'yyyy-MM-dd');
}

async function fetchMyDay(date: string): Promise<MyDayData> {
  const res = await fetch(`/api/myday?date=${date}`);
  if (!res.ok) throw new Error('Failed to load MyDay');
  return res.json();
}

type SheetState =
```

to:

```tsx
import type { MyDayBlock, MyDayUnscheduledItem } from '@/lib/myday/types';
import { myDayQuery, todayKey } from '@/lib/logbook/queries';

type SheetState =
```

(`MyDayData` is dropped from this file's type-only import since nothing here names it directly anymore once the local `fetchMyDay` is removed — check with `grep -n "MyDayData" "app/(logbook)/logbook/myday/_components/MyDayClient.tsx"` and keep it if any other local variable is still explicitly typed as `MyDayData`.)

Change:

```tsx
  const date = searchParams.get('date') ?? todayKey();
  const { profile } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(profile ? `myday-${date}` : null, () => fetchMyDay(date));
```

to:

```tsx
  const date = searchParams.get('date') ?? todayKey();
  const { profile } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(
    profile ? myDayQuery(date).key : null,
    profile ? myDayQuery(date).fetcher : null
  );
```

`formatDate` (the `date-fns` `format` import aliased at the top of this file) may become unused if the deleted local `todayKey()` was its only caller — check with `grep -n "formatDate" "app/(logbook)/logbook/myday/_components/MyDayClient.tsx"` (this file already imports `addDays`/`subDays` from `date-fns` for the day-navigation buttons — if `formatDate` is used elsewhere for display formatting, keep the import; only drop it if the deleted function was its sole use).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "MyDayClient"` — expect no output.
Run: `npx eslint "app/(logbook)/logbook/myday/_components/MyDayClient.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(logbook)/logbook/myday/_components/MyDayClient.tsx"
git commit -m "$(cat <<'EOF'
refactor: MyDay consumes shared myDayQuery/todayKey registry entries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Prefetch + preload wiring in `LogbookBottomNav`

**Files:**
- Modify: `components/LogbookBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `useCurrentProfile()`, `todayQuery`/`myDayQuery`/`todayKey` (Task 1).

- [ ] **Step 1: Add prefetch to both Links + the preload call**

This nav renders two `<Link>`s inline (not a `.map()` loop) — both need `prefetch` added individually.

Change:

```tsx
// components/LogbookBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { LogbookMark } from '@/components/LogbookMark';
import { ProfileMenu } from '@/components/ProfileMenu';
import { cn } from '@/lib/utils';

export function LogbookBottomNav() {
  const pathname = usePathname();
  const isHomeActive = pathname === '/logbook';
  const isMyDayActive = pathname.startsWith('/logbook/myday');
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      <Link
        href="/logbook"
        aria-label="Logbook"
        aria-current={isHomeActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isHomeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isHomeActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <LogbookMark size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">Logbook</span>
      </Link>
      <Link
        href="/logbook/myday"
        aria-label="MyDay"
        aria-current={isMyDayActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isMyDayActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isMyDayActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <CalendarClock size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">MyDay</span>
      </Link>
      <ProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
```

to:

```tsx
// components/LogbookBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { LogbookMark } from '@/components/LogbookMark';
import { ProfileMenu } from '@/components/ProfileMenu';
import { cn } from '@/lib/utils';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { todayQuery, myDayQuery, todayKey } from '@/lib/logbook/queries';

export function LogbookBottomNav() {
  const pathname = usePathname();
  const isHomeActive = pathname === '/logbook';
  const isMyDayActive = pathname.startsWith('/logbook/myday');
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  // Warms Home's (and, since it shares the same key, /logbook/morning's)
  // today data, plus MyDay's default (today's date) view.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(profile ? [todayQuery(), myDayQuery(todayKey())] : []);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      <Link
        href="/logbook"
        prefetch
        aria-label="Logbook"
        aria-current={isHomeActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isHomeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isHomeActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <LogbookMark size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">Logbook</span>
      </Link>
      <Link
        href="/logbook/myday"
        prefetch
        aria-label="MyDay"
        aria-current={isMyDayActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isMyDayActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isMyDayActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <CalendarClock size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">MyDay</span>
      </Link>
      <ProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "LogbookBottomNav"` — expect no output.
Run: `npx eslint components/LogbookBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, land on `/logbook`. Wait ~1 second, then tap "MyDay". Confirm: no new `/api/myday?date=...` request fires, and it renders with no loading skeleton flash. Separately, navigate from Home's `MorningBrief` teaser card into `/logbook/morning` and confirm no new `/api/logbook/today` request fires there either (it shares Home's warmed cache entry).

- [ ] **Step 4: Commit**

```bash
git add components/LogbookBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: LogbookBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: `loading.tsx` for LogBook + full verification pass

**Files:**
- Create: `app/(logbook)/logbook/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(logbook)/logbook/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function LogbookLoading() {
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

Same generic shape as the prior eight apps' `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "logbook/loading"` — expect no output.
Run: `npx eslint "app/(logbook)/logbook/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/logbook/myday` via URL bar, confirm `LogbookLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(logbook)/**/*.tsx" "lib/logbook/**/*.ts" components/LogbookBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests). This is the final task of the final app in the series — this run should reflect the complete, cumulative test suite across all 9 apps' registries.

- [ ] **Step 5: Commit**

```bash
git add "app/(logbook)/logbook/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /logbook/* so prefetch fully warms dynamic routes

This completes the nav-preloading rollout across all 9 sub-apps.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** both LogBook nav tabs converted (Tasks 2–4; MyDay's fetch lives in its client component `MyDayClient.tsx`, not `myday/page.tsx` directly, which is just a `Suspense` wrapper — correctly targeted at the actual fetch site), prefetch + preload wiring on both inline `<Link>`s (Task 5, called out explicitly since this nav doesn't use the `.map()` pattern every other app's does), `loading.tsx` (Task 6).
- **A real duplication found and fixed, not left as latent debt:** `fetchLogbookToday` was copy-pasted verbatim into Home and the morning-brief page. Fixed in Tasks 2–3, with the added benefit that `/logbook/morning` — not itself a nav tab — gets preloaded for free as a side effect, explicitly noted rather than treated as an accidental freebie no one would notice.
- **One judgment call, explained rather than assumed:** MyDay's date-parameterized query is registered (parameterized by `todayKey()`) rather than excluded as page-internal state, because — unlike ShoppingLog's search-filtered listings or BurnLog's period-scoped finance data — it has one well-defined default (today) that's what most nav-tap visits will actually request, the same shape as BurnLog's `workoutPlanQuery(profileId, day)`.
- **Type consistency check:** `todayQuery`'s `fetchToday` returns exactly `LogbookToday` (`lib/logbook/today.ts`, unchanged import site); `myDayQuery`'s `fetchMyDay` returns exactly `MyDayData` (`lib/myday/types.ts`, unchanged import site) — both traced from the original inline fetchers' return types, not re-derived. `todayKey()`'s implementation (`date-fns`' `format(new Date(), 'yyyy-MM-dd')`) is copied verbatim from `MyDayClient.tsx`'s original local function, not reimplemented from a description.
