# Nav Preloading — HomeLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to HomeLog: nav-link prefetch, a query registry, converting HomeLog's four nav tabs to it, wiring the preload into `HomeLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as the four prior apps. HomeLog has its own version of the BurnLog/MoneyLog "registry prevents drift" problem: `'homelog-chores'` is used as an SWR key by **both** `page.tsx` (Home, via a locally-defined `fetchChoresForStats` typed as a narrow `ChoreWithInstance[]`) **and** `chores/page.tsx` (via a locally-defined `fetchChores` typed as the fuller `ChoreInfo[]`) — same endpoint (`/api/homelog/chores`), same key, two independently-maintained type views that could silently diverge if one call site's shape assumption changes without the other being updated. `'homelog-balances'` has the identical problem between Home (`fetchBalancesForStats` / narrow `BalanceRow`) and `bills/page.tsx` (`fetchBalances` / fuller `BalanceInfo`, with member names). This plan unifies both pairs into one registry entry each, using the fuller type in both cases (the narrower type was always just an unused-field subset of the same JSON, never a materially different query). One thing already right in this app, worth reusing rather than re-inventing: `lib/homelog/useHouseholdMe.ts` is itself already a shared, SWR-cached hook every HomeLog page uses instead of independently re-fetching household membership — the registry doesn't touch it, and `HomeLogBottomNav`'s preload wiring reads from it to decide what to warm.

**Tech Stack:** Next.js App Router, `swr@2.5.1`, plain `fetch` (all six of this app's fetchers call HomeLog's own `/api/homelog/*` routes directly with bare `fetch`, not `apiFetch` — so unlike MoneyLog/TravelLog, no `.tsx`-import test gotcha applies here), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-tasklog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-travellog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: this app already keys everything by plain resource-name strings (`'homelog-chores'`, `'homelog-balances'`, etc.) with no `profileId` — the API routes resolve the caller's household from their session server-side, so there's nothing per-profile to parameterize the key by. The registry keeps these exact strings unchanged.
- Zero `.tsx` component tests exist in this repo. Every fetcher in this plan uses bare `fetch()`, not `apiFetch`, so the `.tsx`-import gotcha from the MoneyLog/TravelLog plans does not apply here — no `vi.mock` needed, plain `vi.stubGlobal('fetch', ...)` is sufficient.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.

---

## File Structure

New files:
- `lib/homelog/queries.ts` — HomeLog's query registry: `invitesQuery`, `choresQuery`, `balancesQuery`, `expensesQuery`, `inventoryQuery`, `shoppingListQuery`.
- `lib/homelog/queries.test.ts` — Vitest coverage for all six fetchers/factories.
- `app/(homelog)/homelog/loading.tsx` — Suspense fallback for `/homelog/*`.

Modified files:
- `components/HomeLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(homelog)/homelog/page.tsx` (Home) — consume `invitesQuery`, `choresQuery`, `balancesQuery` instead of its three local fetchers.
- `app/(homelog)/homelog/chores/page.tsx` — consume `choresQuery` instead of its own (duplicate, narrower-elsewhere) local fetcher.
- `app/(homelog)/homelog/bills/page.tsx` — consume `expensesQuery`, `balancesQuery` instead of its two local fetchers.
- `app/(homelog)/homelog/inventory/page.tsx` — consume `inventoryQuery`, `shoppingListQuery` instead of its two local fetchers.

No deep page in scope — HomeLog's four nav tabs (Home, Chores, Inventory, Bills) cover the app's full surface, matching the spec's original scope table.

---

## Task 1: HomeLog query registry

**Files:**
- Create: `lib/homelog/queries.ts`
- Test: `lib/homelog/queries.test.ts`

**Interfaces:**
- Produces:
  - `type PendingInvite = { id: string; householdId: string; householdName: string; invitedByUsername: string; createdAt: string }`
  - `fetchInvites(): Promise<PendingInvite[]>`
  - `invitesQuery(): { key: string; fetcher: () => Promise<PendingInvite[]> }`
  - `type ChoreInfo = { id: string; title: string; category: string; frequency: string; autoRotate: boolean; instance: { id: string; dueDate: string; assignedProfileId: string | null; assignedName: string | null } | null }`
  - `fetchChores(): Promise<ChoreInfo[]>`
  - `choresQuery(): { key: string; fetcher: () => Promise<ChoreInfo[]> }`
  - `type BalanceInfo = { memberA: string; memberAName: string; memberB: string; memberBName: string; net: number }`
  - `fetchBalances(): Promise<BalanceInfo[]>`
  - `balancesQuery(): { key: string; fetcher: () => Promise<BalanceInfo[]> }`
  - `type ExpenseInfo = { id: string; label: string; category: string; totalAmount: number; paidByProfileId: string; paidByName: string; date: string; splits: { profileId: string; name: string; shareAmount: number }[] }`
  - `fetchExpenses(): Promise<ExpenseInfo[]>`
  - `expensesQuery(): { key: string; fetcher: () => Promise<ExpenseInfo[]> }`
  - `type InventoryItem = { id: string; name: string; category: string; quantity: number; lowStockThreshold: number; status: 'in_stock' | 'low' | 'out' }`
  - `fetchInventory(): Promise<InventoryItem[]>`
  - `inventoryQuery(): { key: string; fetcher: () => Promise<InventoryItem[]> }`
  - `type ShoppingItem = { id: string; label: string; addedByName: string; inventoryItemId: string | null }`
  - `fetchShoppingList(): Promise<ShoppingItem[]>`
  - `shoppingListQuery(): { key: string; fetcher: () => Promise<ShoppingItem[]> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/homelog/queries.ts
//
// Single source of truth for HomeLog's preloadable page queries — same
// pattern as the burnlog/moneylog/tasklog/travellog registries.
// `choresQuery` and `balancesQuery` in particular replace a real drift
// risk: 'homelog-chores' and 'homelog-balances' were each used as an SWR
// key by two different pages, each with its OWN locally-defined fetcher
// and its OWN (differently narrow) TypeScript type for the same JSON
// response — safe today only because both call sites happen to agree on
// what fields they read, which is exactly the kind of assumption that
// silently breaks later. Both are unified here on the fuller type.
//
// Every fetcher below calls this app's own /api/homelog/* routes with
// bare fetch() (not apiFetch) — no .tsx-import test gotcha applies here.

export type PendingInvite = {
  id: string;
  householdId: string;
  householdName: string;
  invitedByUsername: string;
  createdAt: string;
};

export async function fetchInvites(): Promise<PendingInvite[]> {
  const res = await fetch('/api/homelog/invites');
  const body = await res.json();
  return body.invites ?? [];
}

export function invitesQuery() {
  return {
    key: 'homelog-invites',
    fetcher: fetchInvites,
  };
}

export type ChoreInfo = {
  id: string;
  title: string;
  category: string;
  frequency: string;
  autoRotate: boolean;
  instance: { id: string; dueDate: string; assignedProfileId: string | null; assignedName: string | null } | null;
};

export async function fetchChores(): Promise<ChoreInfo[]> {
  const res = await fetch('/api/homelog/chores');
  const body = await res.json();
  return body.chores ?? [];
}

export function choresQuery() {
  return {
    key: 'homelog-chores',
    fetcher: fetchChores,
  };
}

export type BalanceInfo = {
  memberA: string;
  memberAName: string;
  memberB: string;
  memberBName: string;
  net: number;
};

export async function fetchBalances(): Promise<BalanceInfo[]> {
  const res = await fetch('/api/homelog/balances');
  const body = await res.json();
  return body.balances ?? [];
}

export function balancesQuery() {
  return {
    key: 'homelog-balances',
    fetcher: fetchBalances,
  };
}

export type ExpenseInfo = {
  id: string;
  label: string;
  category: string;
  totalAmount: number;
  paidByProfileId: string;
  paidByName: string;
  date: string;
  splits: { profileId: string; name: string; shareAmount: number }[];
};

export async function fetchExpenses(): Promise<ExpenseInfo[]> {
  const res = await fetch('/api/homelog/expenses');
  const body = await res.json();
  return body.expenses ?? [];
}

export function expensesQuery() {
  return {
    key: 'homelog-expenses',
    fetcher: fetchExpenses,
  };
}

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  lowStockThreshold: number;
  status: 'in_stock' | 'low' | 'out';
};

export async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch('/api/homelog/inventory');
  const body = await res.json();
  return body.items ?? [];
}

export function inventoryQuery() {
  return {
    key: 'homelog-inventory',
    fetcher: fetchInventory,
  };
}

export type ShoppingItem = {
  id: string;
  label: string;
  addedByName: string;
  inventoryItemId: string | null;
};

export async function fetchShoppingList(): Promise<ShoppingItem[]> {
  const res = await fetch('/api/homelog/shopping-list');
  const body = await res.json();
  return body.items ?? [];
}

export function shoppingListQuery() {
  return {
    key: 'homelog-shopping-list',
    fetcher: fetchShoppingList,
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/homelog/queries.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchInvites,
  fetchChores,
  fetchBalances,
  fetchExpenses,
  fetchInventory,
  fetchShoppingList,
  invitesQuery,
  choresQuery,
  balancesQuery,
  expensesQuery,
  inventoryQuery,
  shoppingListQuery,
} from './queries';

function stubFetchOnce(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => body }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchInvites', () => {
  it('returns the pending invites', async () => {
    const invites = [{ id: 'i1', householdId: 'h1', householdName: 'The Flat', invitedByUsername: 'sam', createdAt: '2026-01-01' }];
    stubFetchOnce({ invites });
    const result = await fetchInvites();
    expect(result).toEqual(invites);
  });

  it('returns an empty array when the response has no invites field', async () => {
    stubFetchOnce({});
    const result = await fetchInvites();
    expect(result).toEqual([]);
  });
});

describe('fetchChores', () => {
  it('returns the household\'s chores', async () => {
    const chores = [{ id: 'c1', title: 'Dishes', category: 'kitchen', frequency: 'daily', autoRotate: true, instance: null }];
    stubFetchOnce({ chores });
    const result = await fetchChores();
    expect(result).toEqual(chores);
  });
});

describe('fetchBalances', () => {
  it('returns the household\'s balances', async () => {
    const balances = [{ memberA: 'p1', memberAName: 'Sam', memberB: 'p2', memberBName: 'Alex', net: 12.5 }];
    stubFetchOnce({ balances });
    const result = await fetchBalances();
    expect(result).toEqual(balances);
  });
});

describe('fetchExpenses', () => {
  it('returns the household\'s expenses', async () => {
    const expenses = [{ id: 'e1', label: 'Groceries', category: 'groceries', totalAmount: 60, paidByProfileId: 'p1', paidByName: 'Sam', date: '2026-08-01', splits: [] }];
    stubFetchOnce({ expenses });
    const result = await fetchExpenses();
    expect(result).toEqual(expenses);
  });
});

describe('fetchInventory', () => {
  it('returns the household\'s inventory items', async () => {
    const items = [{ id: 'i1', name: 'Paper towels', category: 'pantry', quantity: 2, lowStockThreshold: 1, status: 'in_stock' }];
    stubFetchOnce({ items });
    const result = await fetchInventory();
    expect(result).toEqual(items);
  });
});

describe('fetchShoppingList', () => {
  it('returns the household\'s shopping list', async () => {
    const items = [{ id: 's1', label: 'Milk', addedByName: 'Sam', inventoryItemId: null }];
    stubFetchOnce({ items });
    const result = await fetchShoppingList();
    expect(result).toEqual(items);
  });
});

describe('registry key shapes', () => {
  it('invitesQuery keys by a plain resource-name string', () => {
    expect(invitesQuery().key).toBe('homelog-invites');
  });

  it('choresQuery keys by a plain resource-name string', () => {
    expect(choresQuery().key).toBe('homelog-chores');
  });

  it('balancesQuery keys by a plain resource-name string', () => {
    expect(balancesQuery().key).toBe('homelog-balances');
  });

  it('expensesQuery keys by a plain resource-name string', () => {
    expect(expensesQuery().key).toBe('homelog-expenses');
  });

  it('inventoryQuery keys by a plain resource-name string', () => {
    expect(inventoryQuery().key).toBe('homelog-inventory');
  });

  it('shoppingListQuery keys by a plain resource-name string', () => {
    expect(shoppingListQuery().key).toBe('homelog-shopping-list');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/homelog/queries.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/homelog/queries"` — expect no output.
Run: `npx eslint lib/homelog/queries.ts lib/homelog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/homelog/queries.ts lib/homelog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add HomeLog query registry (invites, chores, balances, expenses, inventory, shopping list)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (Home) to `invitesQuery`/`choresQuery`/`balancesQuery`

**Files:**
- Modify: `app/(homelog)/homelog/page.tsx`

**Interfaces:**
- Consumes: `invitesQuery`, `choresQuery`, `balancesQuery` (Task 1).

- [ ] **Step 1: Replace the three local fetchers**

Change the top of the file:

```tsx
interface PendingInvite {
  id: string;
  householdId: string;
  householdName: string;
  invitedByUsername: string;
  createdAt: string;
}

async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const res = await fetch('/api/homelog/invites');
  const body = await res.json();
  return body.invites ?? [];
}

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

export default function HomeLogPage() {
```

to:

```tsx
export default function HomeLogPage() {
```

Add the import:

```tsx
import { invitesQuery, choresQuery, balancesQuery } from '@/lib/homelog/queries';
```

Change:

```tsx
  const { data: pendingInvites, mutate: mutateInvites } = useSWR(
    !isLoading && !household ? 'homelog-invites' : null,
    fetchPendingInvites
  );
  const { data: choresForStats } = useSWR(household ? 'homelog-chores' : null, fetchChoresForStats);
  const { data: balancesForStats } = useSWR(
    household ? 'homelog-balances' : null,
    fetchBalancesForStats
  );
```

to:

```tsx
  const { data: pendingInvites, mutate: mutateInvites } = useSWR(
    !isLoading && !household ? invitesQuery().key : null,
    !isLoading && !household ? invitesQuery().fetcher : null
  );
  const { data: choresForStats } = useSWR(
    household ? choresQuery().key : null,
    household ? choresQuery().fetcher : null
  );
  const { data: balancesForStats } = useSWR(
    household ? balancesQuery().key : null,
    household ? balancesQuery().fetcher : null
  );
```

`choresForStats`/`balancesForStats` now carry the fuller `ChoreInfo[]`/`BalanceInfo[]` shapes instead of the old narrower `ChoreWithInstance[]`/`BalanceRow[]` — this page only ever read `c.instance?.dueDate` and `b.memberA`/`b.memberB`/`b.net` from them (confirmed by the earlier research: `choresDueToday` and `myNetBalance` derivations a few lines below), and every one of those fields is still present, just alongside extra ones this page ignores. No downstream code in this file needs to change.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "\(homelog\)/homelog/page"` — expect no output.
Run: `npx eslint "app/(homelog)/homelog/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(homelog)/homelog/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: HomeLog home page consumes shared invites/chores/balances registry entries

choresQuery/balancesQuery now return the same fuller shape chores/page.tsx
and bills/page.tsx already read (unified in the next two commits) instead
of this page's own narrower, independently-maintained type view of the
same JSON.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `chores/page.tsx` to `choresQuery`

**Files:**
- Modify: `app/(homelog)/homelog/chores/page.tsx`

**Interfaces:**
- Consumes: `choresQuery`, `type ChoreInfo` (Task 1).

- [ ] **Step 1: Replace the local fetcher**

Change:

```tsx
interface ChoreInstanceInfo {
  id: string;
  dueDate: string;
  assignedProfileId: string | null;
  assignedName: string | null;
}

interface ChoreInfo {
  id: string;
  title: string;
  category: string;
  frequency: string;
  autoRotate: boolean;
  instance: ChoreInstanceInfo | null;
}

async function fetchChores(): Promise<ChoreInfo[]> {
  const res = await fetch('/api/homelog/chores');
  const body = await res.json();
  return body.chores ?? [];
}

export default function ChoresPage() {
  const { toast } = useToast();
  const { household, members, isLoading: householdLoading } = useHouseholdMe();
  const {
    data: chores,
    isLoading: choresLoading,
    mutate: refresh,
  } = useSWR(!householdLoading && household ? 'homelog-chores' : null, fetchChores);
```

to:

```tsx
export default function ChoresPage() {
  const { toast } = useToast();
  const { household, members, isLoading: householdLoading } = useHouseholdMe();
  const {
    data: chores,
    isLoading: choresLoading,
    mutate: refresh,
  } = useSWR(
    !householdLoading && household ? choresQuery().key : null,
    !householdLoading && household ? choresQuery().fetcher : null
  );
```

Add the import:

```tsx
import { choresQuery, type ChoreInfo } from '@/lib/homelog/queries';
```

Check whether `ChoreInfo`/`ChoreInstanceInfo` are referenced by name anywhere else in this file (e.g. a local `useState<ChoreInfo | null>` for an edit-in-progress chore) — if so, keep using `ChoreInfo` (now imported from the registry, same field names) and only drop `ChoreInstanceInfo` if nothing outside the deleted block referenced it:

Run: `grep -n "ChoreInstanceInfo\|ChoreInfo" "app/(homelog)/homelog/chores/page.tsx"`

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "chores/page"` — expect no output.
Run: `npx eslint "app/(homelog)/homelog/chores/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(homelog)/homelog/chores/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: chores page consumes shared choresQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `bills/page.tsx` to `expensesQuery`/`balancesQuery`

**Files:**
- Modify: `app/(homelog)/homelog/bills/page.tsx`

**Interfaces:**
- Consumes: `expensesQuery`, `balancesQuery`, `type ExpenseInfo`, `type BalanceInfo` (Task 1).

- [ ] **Step 1: Replace the two local fetchers**

Change:

```tsx
interface ExpenseSplitInfo {
  profileId: string;
  name: string;
  shareAmount: number;
}

interface ExpenseInfo {
  id: string;
  label: string;
  category: string;
  totalAmount: number;
  paidByProfileId: string;
  paidByName: string;
  date: string;
  splits: ExpenseSplitInfo[];
}

interface BalanceInfo {
  memberA: string;
  memberAName: string;
  memberB: string;
  memberBName: string;
  net: number;
}

async function fetchExpenses(): Promise<ExpenseInfo[]> {
  const res = await fetch('/api/homelog/expenses');
  const body = await res.json();
  return body.expenses ?? [];
}

async function fetchBalances(): Promise<BalanceInfo[]> {
  const res = await fetch('/api/homelog/balances');
  const body = await res.json();
  return body.balances ?? [];
}

export default function BillsPage() {
  const { toast } = useToast();
  const { household, members, myProfileId, isLoading: householdLoading } = useHouseholdMe();
  const hasHousehold = !householdLoading && !!household;

  const {
    data: expenseData,
    isLoading: expensesLoading,
    mutate: refreshExpenses,
  } = useSWR(hasHousehold ? 'homelog-expenses' : null, fetchExpenses);
  const {
    data: balanceData,
    isLoading: balancesLoading,
    mutate: refreshBalances,
  } = useSWR(hasHousehold ? 'homelog-balances' : null, fetchBalances);
```

to:

```tsx
export default function BillsPage() {
  const { toast } = useToast();
  const { household, members, myProfileId, isLoading: householdLoading } = useHouseholdMe();
  const hasHousehold = !householdLoading && !!household;

  const {
    data: expenseData,
    isLoading: expensesLoading,
    mutate: refreshExpenses,
  } = useSWR(
    hasHousehold ? expensesQuery().key : null,
    hasHousehold ? expensesQuery().fetcher : null
  );
  const {
    data: balanceData,
    isLoading: balancesLoading,
    mutate: refreshBalances,
  } = useSWR(
    hasHousehold ? balancesQuery().key : null,
    hasHousehold ? balancesQuery().fetcher : null
  );
```

Add the import:

```tsx
import { expensesQuery, balancesQuery, type ExpenseInfo, type BalanceInfo } from '@/lib/homelog/queries';
```

Check whether `ExpenseInfo`/`BalanceInfo`/`ExpenseSplitInfo` are referenced elsewhere in the file the same way as Task 3's check — keep `ExpenseInfo`/`BalanceInfo` (now from the registry), drop `ExpenseSplitInfo` only if nothing outside the deleted block used it.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "bills/page"` — expect no output.
Run: `npx eslint "app/(homelog)/homelog/bills/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(homelog)/homelog/bills/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: bills page consumes shared expensesQuery/balancesQuery registry entries

balancesQuery unifies the same 'homelog-balances' key the home page reads
under its own narrower type — both now share one fetcher and one type.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Convert `inventory/page.tsx` to `inventoryQuery`/`shoppingListQuery`

**Files:**
- Modify: `app/(homelog)/homelog/inventory/page.tsx`

**Interfaces:**
- Consumes: `inventoryQuery`, `shoppingListQuery`, `type InventoryItem`, `type ShoppingItem` (Task 1).

- [ ] **Step 1: Replace the two local fetchers**

Change:

```tsx
interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  lowStockThreshold: number;
  status: 'in_stock' | 'low' | 'out';
}

interface ShoppingItem {
  id: string;
  label: string;
  addedByName: string;
  inventoryItemId: string | null;
}

const STATUS_LABEL: Record<InventoryItem['status'], string> = {
  in_stock: 'In stock',
  low: 'Low',
  out: 'Out',
};

async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch('/api/homelog/inventory');
  const body = await res.json();
  return body.items ?? [];
}

async function fetchShoppingList(): Promise<ShoppingItem[]> {
  const res = await fetch('/api/homelog/shopping-list');
  const body = await res.json();
  return body.items ?? [];
}

export default function InventoryPage() {
  const { toast } = useToast();
  const { household, isLoading: householdLoading } = useHouseholdMe();
  const hasHousehold = !householdLoading && !!household;

  const {
    data: items,
    isLoading: itemsLoading,
    mutate: refreshItems,
  } = useSWR(hasHousehold ? 'homelog-inventory' : null, fetchInventory);
  const {
    data: shoppingItems,
    isLoading: shoppingLoading,
    mutate: refreshShopping,
  } = useSWR(hasHousehold ? 'homelog-shopping-list' : null, fetchShoppingList);
```

to:

```tsx
const STATUS_LABEL: Record<InventoryItem['status'], string> = {
  in_stock: 'In stock',
  low: 'Low',
  out: 'Out',
};

export default function InventoryPage() {
  const { toast } = useToast();
  const { household, isLoading: householdLoading } = useHouseholdMe();
  const hasHousehold = !householdLoading && !!household;

  const {
    data: items,
    isLoading: itemsLoading,
    mutate: refreshItems,
  } = useSWR(
    hasHousehold ? inventoryQuery().key : null,
    hasHousehold ? inventoryQuery().fetcher : null
  );
  const {
    data: shoppingItems,
    isLoading: shoppingLoading,
    mutate: refreshShopping,
  } = useSWR(
    hasHousehold ? shoppingListQuery().key : null,
    hasHousehold ? shoppingListQuery().fetcher : null
  );
```

Add the import:

```tsx
import { inventoryQuery, shoppingListQuery, type InventoryItem, type ShoppingItem } from '@/lib/homelog/queries';
```

`STATUS_LABEL`'s `Record<InventoryItem['status'], ...>` keeps working unchanged — the registry's `InventoryItem.status` union (`'in_stock' | 'low' | 'out'`) is identical to the type this file previously declared locally.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "inventory/page"` — expect no output.
Run: `npx eslint "app/(homelog)/homelog/inventory/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(homelog)/homelog/inventory/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: inventory page consumes shared inventoryQuery/shoppingListQuery registry entries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: Prefetch + preload wiring in `HomeLogBottomNav`

**Files:**
- Modify: `components/HomeLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `useHouseholdMe()` (existing, `lib/homelog/useHouseholdMe.ts`), `invitesQuery`/`choresQuery`/`balancesQuery`/`expensesQuery`/`inventoryQuery`/`shoppingListQuery` (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/HomeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardListIcon, PackageIcon, ReceiptIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HomeLogMark } from '@/components/HomeLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/homelog', label: 'Home', Icon: null },
  { href: '/homelog/chores', label: 'Chores', Icon: ClipboardListIcon },
  { href: '/homelog/inventory', label: 'Inventory', Icon: PackageIcon },
  { href: '/homelog/bills', label: 'Bills', Icon: ReceiptIcon },
];

export function HomeLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/homelog/config' || pathname.startsWith('/homelog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/homelog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
```

to:

```tsx
// components/HomeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardListIcon, PackageIcon, ReceiptIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HomeLogMark } from '@/components/HomeLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import {
  invitesQuery,
  choresQuery,
  balancesQuery,
  expensesQuery,
  inventoryQuery,
  shoppingListQuery,
} from '@/lib/homelog/queries';

const tabs = [
  { href: '/homelog', label: 'Home', Icon: null },
  { href: '/homelog/chores', label: 'Chores', Icon: ClipboardListIcon },
  { href: '/homelog/inventory', label: 'Inventory', Icon: PackageIcon },
  { href: '/homelog/bills', label: 'Bills', Icon: ReceiptIcon },
];

export function HomeLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/homelog/config' || pathname.startsWith('/homelog/config/');

  // Mirrors each page's own household-gating: before a user has joined a
  // household there's nothing to preload but their pending invites; once
  // they're in one, warm every tab's household-scoped data instead.
  const { household, isLoading: householdLoading } = useHouseholdMe();
  usePreloadRoutes(
    householdLoading
      ? []
      : household
        ? [choresQuery(), balancesQuery(), expensesQuery(), inventoryQuery(), shoppingListQuery()]
        : [invitesQuery()]
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/homelog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "HomeLogBottomNav"` — expect no output.
Run: `npx eslint components/HomeLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in with an account that belongs to a household, land on `/homelog`. Wait ~1 second, then tap "Chores", "Inventory", and "Bills" in sequence. Confirm: no new `/api/homelog/chores`, `/api/homelog/balances`, `/api/homelog/expenses`, `/api/homelog/inventory`, or `/api/homelog/shopping-list` request fires for any of them, and all render with no loading skeleton flash.

- [ ] **Step 4: Commit**

```bash
git add components/HomeLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: HomeLogBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 7: `loading.tsx` for HomeLog + full verification pass

**Files:**
- Create: `app/(homelog)/homelog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(homelog)/homelog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function HomeLogLoading() {
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

Same generic shape as the prior four apps' `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "homelog/loading"` — expect no output.
Run: `npx eslint "app/(homelog)/homelog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/homelog/chores` via URL bar, confirm `HomeLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(homelog)/**/*.tsx" "lib/homelog/**/*.ts" components/HomeLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(homelog)/homelog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /homelog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** all four HomeLog nav tabs converted (Tasks 2–5), prefetch + preload wiring (Task 6), `loading.tsx` (Task 7). No deep page or Server Component exclusion applies to this app.
- **Two real drift risks found and fixed, not left as latent debt:** `'homelog-chores'` and `'homelog-balances'` were each independently fetched under the same SWR key by two pages with two different local types for the same JSON — safe today only by coincidence (both call sites happened to only read fields present in both shapes). Unified onto one fetcher and one (fuller) type each in Tasks 2–4.
- **Type consistency check:** `ChoreInfo`/`BalanceInfo`/`ExpenseInfo`/`InventoryItem`/`ShoppingItem` in the registry are verbatim copies of the fuller type each already had in exactly one of its two (or one) call sites — traced field-by-field from the original interfaces read during research, not re-derived from guesswork. `STATUS_LABEL`'s `Record<InventoryItem['status'], string>` in Task 5 keeps compiling unchanged since the registry's `status` union matches exactly.
