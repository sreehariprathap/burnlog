# Nav Preloading — MoneyLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism (proven on BurnLog) to MoneyLog: nav-link prefetch, a query registry, converting MoneyLog's nav tabs + assets deep page to it, wiring the preload into `MoneyLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as BurnLog — `lib/moneylog/queries.ts` co-locates each preloadable page's SWR key + fetcher; `MoneyLogBottomNav` calls `usePreloadRoutes()` (from `lib/usePreloadRoutes.ts`, already built) on idle. New in this app: a concrete "registry prevents drift" case worse than BurnLog's — `recurring_items` (active only) is independently, uncached-ly fetched by **three** separate call sites (`plan/page.tsx`, `FinancialGoalsList.tsx`, `lib/useFinanceData.ts`) with no SWR involved at all. Unifying two of those three into the registry is this plan's biggest win (the third, `useFinanceData`, stays out of scope — see Task 3's note).

**Tech Stack:** Next.js App Router, `swr@2.5.1`, Supabase JS client, `apiFetch` (`lib/apiFetch.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plan (shared mechanism, already merged):** `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: `` [`${app}-${resource}`, profileId, ...params] `` — e.g. `'moneylog-financial-goals'`, `'moneylog-recurring-items'`. The assets registry entry is the one exception: it already exists as a plain string key (`'/api/moneylog/assets'`, no profileId) because the API route scopes by session server-side — keep that as-is rather than forcing a profileId into it.
- Zero `.tsx` component tests exist in this repo — give every new testable pure function (registry fetchers, taking an explicit `SupabaseClient` param) a real Vitest test, matching `lib/burnlog/queries.test.ts`. Verify React glue via `tsc`/`eslint` plus manual steps.
- `usePreloadRoutes` (`lib/usePreloadRoutes.ts`) and its `PreloadableQuery` type already exist from the BurnLog plan — do not redefine them.

---

## File Structure

New files:
- `lib/moneylog/queries.ts` — MoneyLog's query registry: `financialGoalsQuery`, `recurringItemsQuery`, `allFinanceTransactionsQuery`, `assetsQuery`.
- `lib/moneylog/queries.test.ts` — Vitest coverage for the four fetchers/factories.
- `app/(moneylog)/moneylog/loading.tsx` — Suspense fallback for `/moneylog/*`.

Modified files:
- `components/MoneyLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (this app never got it — only BurnLog's nav did, in an earlier session) and wire `usePreloadRoutes`.
- `app/(moneylog)/moneylog/goals/page.tsx` — consume `useCurrentProfile()` + `financialGoalsQuery` instead of its own `auth.getUser()` → profile → goals chain.
- `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx` — consume `recurringItemsQuery` + `allFinanceTransactionsQuery` instead of its own uncached `useEffect` fetch (this is the second of the three duplicate `recurring_items` fetches).
- `app/(moneylog)/moneylog/plan/page.tsx` — consume `useCurrentProfile()` + `recurringItemsQuery` instead of its own `auth.getUser()` → profile → items chain (the third duplicate `recurring_items` fetch — now unified with `FinancialGoalsList`'s).
- `app/(moneylog)/moneylog/assets/page.tsx` — consume `assetsQuery()` instead of its own inline key/fetcher (same key, same fetcher logic — this makes it registry-preloadable without changing behavior).

Explicitly NOT modified (documented, not silently skipped):
- `app/(moneylog)/moneylog/page.tsx` / `lib/useFinanceData.ts` — the home tab's period-scoped income/expense breakdown. `useFinanceData` refetches on every mount today (no SWR at all), but its query is parameterized by a page-internal `period` selector (weekly/monthly/yearly), not by navigation — there's no single stable key to preload ahead of a nav tap the way there is for the other three pages. Converting it is real, valuable follow-up work, but it's a UI-state-scoped fetch, not a nav-destination-scoped one, so it's out of this plan's scope per the spec's "nav tabs + top deep pages" boundary.
- `app/(moneylog)/moneylog/insights/page.tsx` — Server Component (confirmed: `export default async function MoneyLogInsightsPage()`, calls `createClient()` from `@/lib/supabase/server`), same reasoning as BurnLog's Insights tab in the prior plan — out of scope for the SWR/preload registry; still benefits from `loading.tsx` (Task 5) same as every other MoneyLog route.

---

## Task 1: MoneyLog query registry

**Files:**
- Create: `lib/moneylog/queries.ts`
- Test: `lib/moneylog/queries.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this plan starts fresh; `usePreloadRoutes`/`PreloadableQuery` come from the already-merged foundation plan).
- Produces:
  - `type FinancialGoal = { id: string; goalType: string; label: string; category: string | null; targetValue: number; targetDate: string | null; createdAt: string }` (matches `lib/financeGoalProgress.ts`'s existing `FinancialGoalRow` field-for-field — re-exported as an alias, not redefined, so the two names stay interchangeable).
  - `fetchFinancialGoals(supabase: SupabaseClient, profileId: string): Promise<FinancialGoal[]>`
  - `financialGoalsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<FinancialGoal[]> }`
  - `type RecurringItem = { id: string; type: 'income' | 'expense'; category: string; label: string; amount: number; frequency: 'weekly' | 'monthly' | 'yearly'; dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null }` (matches `lib/recurringItemDraft.ts`'s `RecurringItemDraft` plus `id`).
  - `fetchRecurringItems(supabase: SupabaseClient, profileId: string): Promise<RecurringItem[]>`
  - `recurringItemsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<RecurringItem[]> }`
  - `type FinanceTransactionLine = { type: string; category: string; amount: number; date: string }`
  - `fetchAllFinanceTransactions(supabase: SupabaseClient, profileId: string): Promise<FinanceTransactionLine[]>`
  - `allFinanceTransactionsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<FinanceTransactionLine[]> }`
  - `type AssetsSummary = { assets: AssetSummary[]; netWorth: number }` where `AssetSummary` is imported from `app/(moneylog)/moneylog/assets/_components/AssetListItem.tsx` (already exported there — don't redefine it).
  - `fetchAssetsSummary(): Promise<AssetsSummary>`
  - `assetsQuery(): { key: string; fetcher: () => Promise<AssetsSummary> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/moneylog/queries.ts
//
// Single source of truth for MoneyLog's preloadable page queries — same
// pattern as lib/burnlog/queries.ts. `recurringItemsQuery` in particular
// replaces THREE independent, uncached fetches of the same
// recurring_items|isActive=true data (plan/page.tsx, FinancialGoalsList.tsx,
// and lib/useFinanceData.ts, though the last stays out of scope — see the
// plan's "Explicitly NOT modified" note) with one shared cache entry.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import type { AssetSummary } from '@/app/(moneylog)/moneylog/assets/_components/AssetListItem';

export type FinancialGoal = {
  id: string;
  goalType: string;
  label: string;
  category: string | null;
  targetValue: number;
  targetDate: string | null;
  createdAt: string;
};

export async function fetchFinancialGoals(supabase: SupabaseClient, profileId: string): Promise<FinancialGoal[]> {
  const { data, error } = await supabase
    .from('financial_goals')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data as FinancialGoal[]) ?? [];
}

export function financialGoalsQuery(profileId: string) {
  return {
    key: ['moneylog-financial-goals', profileId] as const,
    fetcher: () => fetchFinancialGoals(createClient(), profileId),
  };
}

export type RecurringItem = {
  id: string;
  type: 'income' | 'expense';
  category: string;
  label: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'yearly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
};

export async function fetchRecurringItems(supabase: SupabaseClient, profileId: string): Promise<RecurringItem[]> {
  const { data, error } = await supabase
    .from('recurring_items')
    .select('*')
    .eq('profileId', profileId)
    .eq('isActive', true)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data as RecurringItem[]) ?? [];
}

export function recurringItemsQuery(profileId: string) {
  return {
    key: ['moneylog-recurring-items', profileId] as const,
    fetcher: () => fetchRecurringItems(createClient(), profileId),
  };
}

export type FinanceTransactionLine = { type: string; category: string; amount: number; date: string };

export async function fetchAllFinanceTransactions(
  supabase: SupabaseClient,
  profileId: string
): Promise<FinanceTransactionLine[]> {
  const { data, error } = await supabase.from('finance_transactions').select('*').eq('profileId', profileId);
  if (error) throw error;
  return (data as FinanceTransactionLine[]) ?? [];
}

export function allFinanceTransactionsQuery(profileId: string) {
  return {
    key: ['moneylog-all-finance-transactions', profileId] as const,
    fetcher: () => fetchAllFinanceTransactions(createClient(), profileId),
  };
}

export type AssetsSummary = { assets: AssetSummary[]; netWorth: number };

export async function fetchAssetsSummary(): Promise<AssetsSummary> {
  const res = await apiFetch('/api/moneylog/assets');
  if (!res.ok) throw new Error('Failed to load assets');
  return res.json();
}

export function assetsQuery() {
  return {
    key: '/api/moneylog/assets',
    fetcher: fetchAssetsSummary,
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/moneylog/queries.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchFinancialGoals,
  fetchRecurringItems,
  fetchAllFinanceTransactions,
  fetchAssetsSummary,
  financialGoalsQuery,
  recurringItemsQuery,
  allFinanceTransactionsQuery,
  assetsQuery,
} from './queries';

// Same shape as lib/burnlog/queries.test.ts's fakeSupabase: Supabase query
// builders are thenable at every step (so a query can be awaited directly)
// while also being chainable further (a second .eq(), .order(), etc.).
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const order = vi.fn().mockReturnValue(makeThenable({}));
  const eqSecond = makeThenable({ order });
  const eqFirst = makeThenable({ eq: vi.fn().mockReturnValue(eqSecond), order });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqFirst) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchFinancialGoals', () => {
  it('returns the profile\'s financial goals', async () => {
    const goals = [{ id: 'g1', goalType: 'savings_target', label: 'Emergency Fund', category: null, targetValue: 5000, targetDate: null, createdAt: '2026-01-01' }];
    const supabase = fakeSupabase({ data: goals, error: null });
    const result = await fetchFinancialGoals(supabase, 'profile-1');
    expect(result).toEqual(goals);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchFinancialGoals(supabase, 'profile-1')).rejects.toThrow('boom');
  });
});

describe('fetchRecurringItems', () => {
  it('returns the profile\'s active recurring items', async () => {
    const items = [{ id: 'r1', type: 'expense', category: 'rent', label: 'Rent', amount: 1500, frequency: 'monthly', dayOfWeek: null, dayOfMonth: 1, monthOfYear: null }];
    const supabase = fakeSupabase({ data: items, error: null });
    const result = await fetchRecurringItems(supabase, 'profile-1');
    expect(result).toEqual(items);
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchRecurringItems(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchAllFinanceTransactions', () => {
  it('returns the profile\'s full transaction history', async () => {
    const transactions = [{ type: 'expense', category: 'groceries', amount: 50, date: '2026-08-01' }];
    const supabase = fakeSupabase({ data: transactions, error: null });
    const result = await fetchAllFinanceTransactions(supabase, 'profile-1');
    expect(result).toEqual(transactions);
  });
});

describe('fetchAssetsSummary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed assets summary on success', async () => {
    const summary = { assets: [{ id: 'a1', name: 'Checking', category: 'bank', value: 1000, updatedAt: null }], netWorth: 1000 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => summary, clone: () => ({ json: async () => summary }) }));
    const result = await fetchAssetsSummary();
    expect(result).toEqual(summary);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
      clone: () => ({ json: async () => ({ error: 'server error' }) }),
    }));
    await expect(fetchAssetsSummary()).rejects.toThrow('Failed to load assets');
  });
});

describe('registry key shapes', () => {
  it('financialGoalsQuery keys by app+resource+profileId', () => {
    expect(financialGoalsQuery('profile-1').key).toEqual(['moneylog-financial-goals', 'profile-1']);
  });

  it('recurringItemsQuery keys by app+resource+profileId', () => {
    expect(recurringItemsQuery('profile-1').key).toEqual(['moneylog-recurring-items', 'profile-1']);
  });

  it('allFinanceTransactionsQuery keys by app+resource+profileId', () => {
    expect(allFinanceTransactionsQuery('profile-1').key).toEqual(['moneylog-all-finance-transactions', 'profile-1']);
  });

  it('assetsQuery keys by the API route path (session-scoped server-side, no profileId needed)', () => {
    expect(assetsQuery().key).toBe('/api/moneylog/assets');
  });
});
```

`apiFetch` (`lib/apiFetch.ts`) calls the global `fetch`, shows a toast on failure via the shadcn toast system, and calls `reportDevError`. The `vi.stubGlobal('fetch', ...)` mocks above avoid needing to mock those side effects directly — `apiFetch`'s own error-path code still runs (toast/reportDevError), but neither throws, so the test only needs to assert on `fetchAssetsSummary`'s return/throw behavior.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/moneylog/queries.test.ts`
Expected: all tests PASS. If the `fakeSupabase` thenable-chaining fails the same way it initially failed in the BurnLog plan (a `.eq()`/`.order()` step awaited directly returning the wrong shape), apply the same fix pattern documented there: every intermediate step must be both thenable AND chainable, not one or the other.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/moneylog/queries"` — expect no output.
Run: `npx eslint lib/moneylog/queries.ts lib/moneylog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/moneylog/queries.ts lib/moneylog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add MoneyLog query registry (financial goals, recurring items, transactions, assets)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `goals/page.tsx` to `useCurrentProfile` + the registry

**Files:**
- Modify: `app/(moneylog)/moneylog/goals/page.tsx`

**Interfaces:**
- Consumes: `useCurrentProfile()` (existing, `lib/useCurrentProfile.ts`), `financialGoalsQuery` (Task 1).

- [ ] **Step 1: Replace the fetch chain**

Change:

```tsx
// app/(moneylog)/moneylog/goals/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import { AddFinancialGoalForm } from './_components/AddFinancialGoalForm';
import { FinancialGoalsList } from './_components/FinancialGoalsList';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';
import { useToast } from '@/components/ui/use-toast';

// Client Component — cannot export `metadata`; page title is set via TopBar below.
export default function FinancialGoalsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [goals, setGoals] = useState<FinancialGoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(
    async (id: string) => {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_goals')
        .select('*')
        .eq('profileId', id)
        .order('createdAt', { ascending: false });
      if (error) {
        toast({ title: 'Failed to load goals', description: error.message, variant: 'destructive' });
      }
      setGoals((data as FinancialGoalRow[]) || []);
      setLoading(false);
    },
    [supabase, toast]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      fetchGoals(profile.id);
    })();
  }, [supabase, fetchGoals]);

  function handleGoalAdded(goal: FinancialGoalRow) {
    setGoals((prev) => [goal, ...prev]);
  }

  function handleGoalUpdated(goal: FinancialGoalRow) {
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? goal : g)));
  }
```

to:

```tsx
// app/(moneylog)/moneylog/goals/page.tsx
'use client';

import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import { AddFinancialGoalForm } from './_components/AddFinancialGoalForm';
import { FinancialGoalsList } from './_components/FinancialGoalsList';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { financialGoalsQuery } from '@/lib/moneylog/queries';
import { useToast } from '@/components/ui/use-toast';

// Client Component — cannot export `metadata`; page title is set via TopBar below.
export default function FinancialGoalsPage() {
  const { toast } = useToast();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const profileId = profile?.id ?? null;

  const { data: goals = [], isLoading: goalsLoading, mutate: mutateGoals } = useSWR<FinancialGoalRow[]>(
    profile ? financialGoalsQuery(profile.id).key : null,
    profile ? financialGoalsQuery(profile.id).fetcher : null,
    {
      onError: (error) => {
        toast({ title: 'Failed to load goals', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      },
    }
  );
  const loading = profileLoading || goalsLoading;

  function handleGoalAdded(goal: FinancialGoalRow) {
    mutateGoals([goal, ...goals], { revalidate: false });
  }

  function handleGoalUpdated(goal: FinancialGoalRow) {
    mutateGoals(goals.map((g) => (g.id === goal.id ? goal : g)), { revalidate: false });
  }
```

The rest of the file (the JSX return block using `loading`, `profileId`, `goals`, `handleGoalAdded`, `handleGoalUpdated`) is unchanged — every name it reads still exists with the same shape.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "goals/page"` — expect only `app/(burnlog)/burnlog/goals/page.tsx` (from the prior plan, already-verified clean) or no output for the MoneyLog path specifically — check `app/(moneylog)/moneylog/goals/page.tsx` isn't listed.
Run: `npx eslint "app/(moneylog)/moneylog/goals/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(moneylog)/moneylog/goals/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: MoneyLog goals page consumes shared financialGoalsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `FinancialGoalsList.tsx` to the registry

This component's `recurringItems`/`transactions` fetch is the second of the three duplicate `recurring_items` fetches this plan finds. Converting it to `recurringItemsQuery` unifies it with `plan/page.tsx`'s fetch (Task 4) — the third, `lib/useFinanceData.ts`, stays out of scope per this plan's "Explicitly NOT modified" note (it's parameterized by page-internal UI state, not a nav destination).

**Files:**
- Modify: `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx`

**Interfaces:**
- Consumes: `recurringItemsQuery`, `allFinanceTransactionsQuery` (Task 1).

- [ ] **Step 1: Replace the fetch effect**

Change the import block:

```tsx
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { startOfMonth, endOfMonth } from 'date-fns';
```

to:

```tsx
import { useState } from 'react';
import useSWR from 'swr';
import { startOfMonth, endOfMonth } from 'date-fns';
import { recurringItemsQuery, allFinanceTransactionsQuery } from '@/lib/moneylog/queries';
```

Change:

```tsx
export function FinancialGoalsList({ goals, profileId, onGoalUpdated }: FinancialGoalsListProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [recurringItems, setRecurringItems] = useState<RecurringItemRow[]>([]);
  const [transactions, setTransactions] = useState<{ type: string; category: string; amount: number; date: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
```

to:

```tsx
export function FinancialGoalsList({ goals, profileId, onGoalUpdated }: FinancialGoalsListProps) {
  const { toast } = useToast();
  const { data: recurringItems = [] } = useSWR(
    profileId ? recurringItemsQuery(profileId).key : null,
    profileId ? recurringItemsQuery(profileId).fetcher : null
  );
  const { data: transactions = [] } = useSWR(
    profileId ? allFinanceTransactionsQuery(profileId).key : null,
    profileId ? allFinanceTransactionsQuery(profileId).fetcher : null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
```

`supabase` is still used later in the component by `saveEdit` — keep the `import { createClient } from '@/lib/supabase/client';` import and re-add a local `const supabase = createClient();` at the top of `saveEdit`:

Change:

```tsx
  async function saveEdit(goal: FinancialGoalRow) {
    const targetNum = Number(editTargetValue);
    if (!editLabel.trim() || !editTargetValue || isNaN(targetNum) || targetNum <= 0) {
      toast({ title: 'Please enter a valid label and target amount', variant: 'destructive' });
      return;
    }
    const needsCategory = goal.goalType === 'spending_cap' || goal.goalType === 'investment_contribution';
    const needsDate = goal.goalType === 'savings_target' || goal.goalType === 'debt_payoff';

    setSavingEdit(true);
    const { data, error } = await supabase
```

to:

```tsx
  async function saveEdit(goal: FinancialGoalRow) {
    const targetNum = Number(editTargetValue);
    if (!editLabel.trim() || !editTargetValue || isNaN(targetNum) || targetNum <= 0) {
      toast({ title: 'Please enter a valid label and target amount', variant: 'destructive' });
      return;
    }
    const needsCategory = goal.goalType === 'spending_cap' || goal.goalType === 'investment_contribution';
    const needsDate = goal.goalType === 'savings_target' || goal.goalType === 'debt_payoff';

    setSavingEdit(true);
    const supabase = createClient();
    const { data, error } = await supabase
```

Remove the now-unreachable old effect entirely:

```tsx
  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const [recurringRes, transactionsRes] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('finance_transactions').select('*').eq('profileId', profileId),
      ]);
      setRecurringItems((recurringRes.data as RecurringItemRow[]) || []);
      setTransactions(
        (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || []
      );
    })();
  }, [profileId, supabase]);
```

Also remove the now-unused `RecurringItemRow`/`FinanceLineItem` type imports if `expandRecurringInRange` (which still needs `RecurringItemRow[]`) is the only remaining consumer — check with:

Run: `grep -n "RecurringItemRow\|FinanceLineItem" "app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx"`

`expandRecurringInRange(recurringItems, ...)` is called further down in the file and expects `RecurringItemRow[]` — the registry's `RecurringItem` type (Task 1) has the same shape as `RecurringItemRow` (both mirror `RecurringItemDraft` + `id`), so no cast is needed at that call site, but keep the `import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';` import since `FinanceLineItem` is still constructed inline further down (`sinceCreationItems: FinanceLineItem[] = [...]`).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "FinancialGoalsList"` — expect no output.
Run: `npx eslint "app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx"
git commit -m "$(cat <<'EOF'
refactor: FinancialGoalsList shares recurringItemsQuery/allFinanceTransactionsQuery

Was an uncached useEffect fetch of the same recurring_items|isActive data
plan/page.tsx independently fetches. Unified in Task 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `plan/page.tsx` to `useCurrentProfile` + the registry

The third and last of the three duplicate `recurring_items` fetches. Once this and Task 3 land, `plan/page.tsx` and `FinancialGoalsList.tsx` share one cache entry — preloading `recurringItemsQuery` from the nav (Task 6) now warms both the Plan tab and (whenever it's rendered) the goals-progress computation.

**Files:**
- Modify: `app/(moneylog)/moneylog/plan/page.tsx`

**Interfaces:**
- Consumes: `useCurrentProfile()`, `recurringItemsQuery` (Task 1).

- [ ] **Step 1: Replace the fetch chain**

Change:

```tsx
// app/(moneylog)/moneylog/plan/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringItemForm } from '@/components/moneylog/RecurringItemForm';
import { RecurringItemsList } from './_components/RecurringItemsList';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';
import { useToast } from '@/components/ui/use-toast';

export interface PlanRecurringItem extends RecurringItemDraft {
  id: string;
}

// Client Component — cannot export `metadata`; page title is set via TopBar below.
export default function PlanPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<PlanRecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchItems = useCallback(
    async (id: string) => {
      setLoading(true);
      const { data, error } = await supabase
        .from('recurring_items')
        .select('*')
        .eq('profileId', id)
        .eq('isActive', true)
        .order('createdAt', { ascending: false });
      if (error) {
        toast({ title: 'Failed to load recurring items', description: error.message, variant: 'destructive' });
      }
      setItems((data as PlanRecurringItem[]) || []);
      setLoading(false);
    },
    [supabase, toast]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      fetchItems(profile.id);
    })();
  }, [supabase, fetchItems]);

  async function handleAdd(draft: RecurringItemDraft) {
    if (!profileId) return;
    const { data, error } = await supabase
      .from('recurring_items')
      .insert([{ ...draft, profileId }])
      .select()
      .single();
    if (error) {
      toast({ title: 'Failed to add item', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((prev) => [data as PlanRecurringItem, ...prev]);
    setShowForm(false);
    toast({ title: 'Recurring item added' });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('recurring_items').update({ isActive: false }).eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete item', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
    toast({ title: 'Recurring item deleted' });
  }
```

to:

```tsx
// app/(moneylog)/moneylog/plan/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringItemForm } from '@/components/moneylog/RecurringItemForm';
import { RecurringItemsList } from './_components/RecurringItemsList';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { recurringItemsQuery } from '@/lib/moneylog/queries';
import { useToast } from '@/components/ui/use-toast';

export interface PlanRecurringItem extends RecurringItemDraft {
  id: string;
}

// Client Component — cannot export `metadata`; page title is set via TopBar below.
export default function PlanPage() {
  const { toast } = useToast();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const profileId = profile?.id ?? null;
  const [showForm, setShowForm] = useState(false);

  const { data: items = [], isLoading: itemsLoading, mutate: mutateItems } = useSWR<PlanRecurringItem[]>(
    profile ? recurringItemsQuery(profile.id).key : null,
    profile ? recurringItemsQuery(profile.id).fetcher : null,
    {
      onError: (error) => {
        toast({ title: 'Failed to load recurring items', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      },
    }
  );
  const loading = profileLoading || itemsLoading;

  async function handleAdd(draft: RecurringItemDraft) {
    if (!profileId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('recurring_items')
      .insert([{ ...draft, profileId }])
      .select()
      .single();
    if (error) {
      toast({ title: 'Failed to add item', description: error.message, variant: 'destructive' });
      return;
    }
    mutateItems([data as PlanRecurringItem, ...items], { revalidate: false });
    setShowForm(false);
    toast({ title: 'Recurring item added' });
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('recurring_items').update({ isActive: false }).eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete item', description: error.message, variant: 'destructive' });
      return;
    }
    mutateItems(items.filter((item) => item.id !== id), { revalidate: false });
    toast({ title: 'Recurring item deleted' });
  }
```

The rest of the file (JSX return block reading `loading`, `items`, `showForm`, `handleAdd`, `handleDelete`) is unchanged.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "moneylog/plan/page"` — expect no output.
Run: `npx eslint "app/(moneylog)/moneylog/plan/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(moneylog)/moneylog/plan/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: plan page shares recurringItemsQuery with FinancialGoalsList

Third of three independent, uncached recurring_items|isActive fetches
(plan, FinancialGoalsList, useFinanceData) unified via the registry. Only
useFinanceData stays out of scope — see the plan's "Explicitly NOT
modified" note.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Convert `assets/page.tsx` to the registry (deep page)

**Files:**
- Modify: `app/(moneylog)/moneylog/assets/page.tsx`

**Interfaces:**
- Consumes: `assetsQuery` (Task 1).

- [ ] **Step 1: Swap the inline key/fetcher for the registry entry**

Change:

```tsx
// app/(moneylog)/moneylog/assets/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { NetWorthSummaryCard } from './_components/NetWorthSummaryCard';
import { AssetListItem, type AssetSummary } from './_components/AssetListItem';
import { AddAssetDrawer } from './_components/AddAssetDrawer';
import { UpdateBalanceDrawer } from './_components/UpdateBalanceDrawer';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load assets');
  return res.json();
}

export default function AssetsPage() {
  const { data, isLoading, mutate } = useSWR<{ assets: AssetSummary[]; netWorth: number }>(
    '/api/moneylog/assets',
    fetcher
  );
```

to:

```tsx
// app/(moneylog)/moneylog/assets/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Button } from '@/components/ui/button';
import { assetsQuery, type AssetsSummary } from '@/lib/moneylog/queries';
import { NetWorthSummaryCard } from './_components/NetWorthSummaryCard';
import { AssetListItem, type AssetSummary } from './_components/AssetListItem';
import { AddAssetDrawer } from './_components/AddAssetDrawer';
import { UpdateBalanceDrawer } from './_components/UpdateBalanceDrawer';

export default function AssetsPage() {
  const { data, isLoading, mutate } = useSWR<AssetsSummary>(
    assetsQuery().key,
    assetsQuery().fetcher
  );
```

`AssetSummary` stays imported (still used in the `useState<AssetSummary | null>` below and by `AssetListItem`'s props) — only the duplicate `{ assets: AssetSummary[]; netWorth: number }` inline type and the local `fetcher` function are removed, replaced by the registry's `AssetsSummary` type and `assetsQuery()`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "assets/page"` — expect no output (or only the already-clean `app/(moneylog)/moneylog/assets/[id]/page.tsx` from earlier session work, unrelated to this change).
Run: `npx eslint "app/(moneylog)/moneylog/assets/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(moneylog)/moneylog/assets/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: assets page consumes shared assetsQuery registry entry

Same key/fetcher as before ('/api/moneylog/assets') — this only moves it
into the registry so the nav preloader (Task 6) can warm it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: Prefetch + preload wiring in `MoneyLogBottomNav`

Unlike BurnLog's `BottomNav`, MoneyLog's nav never got `prefetch` on its `<Link>`s at all (confirmed: only BurnLog's nav had it going into this work) — this task adds both the code-prefetch and the data-preload in one pass.

**Files:**
- Modify: `components/MoneyLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (already exists, `lib/usePreloadRoutes.ts`), `useCurrentProfile()`, `financialGoalsQuery`/`recurringItemsQuery`/`assetsQuery` (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/MoneyLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClockIcon, TargetIcon, ChartLineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/moneylog', label: 'Home', Icon: null },
  { href: '/moneylog/plan', label: 'Plan', Icon: CalendarClockIcon },
  { href: '/moneylog/goals', label: 'Goals', Icon: TargetIcon },
  { href: '/moneylog/insights', label: 'Insights', Icon: ChartLineIcon },
];

export function MoneyLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/moneylog/config' || pathname.startsWith('/moneylog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/moneylog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
```

to:

```tsx
// components/MoneyLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClockIcon, TargetIcon, ChartLineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { financialGoalsQuery, recurringItemsQuery, assetsQuery } from '@/lib/moneylog/queries';

const tabs = [
  { href: '/moneylog', label: 'Home', Icon: null },
  { href: '/moneylog/plan', label: 'Plan', Icon: CalendarClockIcon },
  { href: '/moneylog/goals', label: 'Goals', Icon: TargetIcon },
  { href: '/moneylog/insights', label: 'Insights', Icon: ChartLineIcon },
];

export function MoneyLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/moneylog/config' || pathname.startsWith('/moneylog/config/');

  // Warms Plan, Goals, and the Assets deep page (Insights stays
  // server-rendered — see this plan's "Explicitly NOT modified" note) so
  // switching tabs after this nav has been mounted a moment renders from
  // cache instead of a fresh fetch.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [financialGoalsQuery(profile.id), recurringItemsQuery(profile.id), assetsQuery()]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/moneylog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "MoneyLogBottomNav"` — expect no output.
Run: `npx eslint components/MoneyLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, and land on `/moneylog`. Wait ~1 second, then tap "Plan" and "Goals" in sequence. Confirm: no new `recurring_items`/`financial_goals` request fires for either tab, and both render with no loading skeleton flash. Also visit `/moneylog/assets` from the home tab's "Net Worth" card — same expectation (no `/api/moneylog/assets` request, no spinner).

- [ ] **Step 4: Commit**

```bash
git add components/MoneyLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: MoneyLogBottomNav prefetches tab links and preloads their data on idle

MoneyLog's nav never had Link prefetch at all before this (only BurnLog's
did) — this adds both the code-prefetch and the registry-backed data
preload in one pass.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 7: `loading.tsx` for MoneyLog + full verification pass

**Files:**
- Create: `app/(moneylog)/moneylog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(moneylog)/moneylog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function MoneyLogLoading() {
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

Same generic shape as BurnLog's `app/(burnlog)/burnlog/loading.tsx` — intentionally not pixel-matched to any one MoneyLog page.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "moneylog/loading"` — expect no output.
Run: `npx eslint "app/(moneylog)/moneylog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Same as the BurnLog plan's Task 9: throttle the network, hard-navigate to `/moneylog/plan` via URL bar, confirm `MoneyLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(moneylog)/**/*.tsx" "lib/moneylog/**/*.ts" components/MoneyLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(moneylog)/moneylog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /moneylog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** MoneyLog nav tabs (`/moneylog`, `/plan`, `/goals` converted to the registry — Tasks 2, 4; `/insights` correctly excluded as a Server Component) and the deep page (`/moneylog/assets`, Task 5) match the spec's scope table exactly. Prefetch + preload wiring (Task 6) and `loading.tsx` (Task 7) mirror the BurnLog plan's Tasks 8–9.
- **A real bug found and fixed, not left as latent debt:** `recurring_items|isActive=true` was independently, uncached-ly fetched by three separate call sites. Two of the three (`plan/page.tsx`, `FinancialGoalsList.tsx`) are unified by this plan (Tasks 3–4); the third (`lib/useFinanceData.ts`) is explicitly named and left out of scope with a stated reason, not silently dropped.
- **Type consistency check:** `FinancialGoal` (registry) mirrors `FinancialGoalRow` (`lib/financeGoalProgress.ts`) field-for-field — `goals/page.tsx` (Task 2) still types its state as `FinancialGoalRow[]` and receives exactly that shape back from `financialGoalsQuery`'s fetcher. `RecurringItem` (registry) mirrors `RecurringItemDraft` + `id`, matching `PlanRecurringItem` in `plan/page.tsx` (Task 4) and `RecurringItemRow` in `FinancialGoalsList.tsx` (Task 3) — no cast needed at either call site. `AssetsSummary`/`AssetSummary` reuse the existing type from `AssetListItem.tsx` rather than redefining it a third time.
