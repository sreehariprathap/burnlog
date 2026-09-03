# Nav Preloading — ShoppingLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to ShoppingLog: nav-link prefetch, a query registry, converting ShoppingLog's three nav tabs to it, wiring the preload into `ShoppingLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as the six prior apps. ShoppingLog has TravelLog's exact duplication pattern: `categoriesQuery` (key `'/api/shoppinglog/categories'`) is fetched by a verbatim-identical local `fetcher` function copy-pasted into both `page.tsx` (Browse) and `sell/page.tsx` — same key, same body, no cache-correctness bug (SWR already dedupes by key), but the same query logic living in two files instead of one. The Browse page's main listings query (`` `/api/shoppinglog/listings?${params}` ``) stays out of scope — its key changes on every keystroke/filter change (search query, category, condition), making it page-internal UI state rather than a stable, nav-preloadable query, the same judgment call as BurnLog's `useFinanceData` and TravelLog's free-time signals.

**Tech Stack:** Next.js App Router, `swr@2.5.1`, `apiFetch` (`lib/apiFetch.ts`) — every fetcher in this app goes through it, so the `.tsx`-import test gotcha from the MoneyLog/TravelLog plans applies to every test in this one, not just one.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-tasklog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-travellog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-homelog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-learnlog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: this app already keys everything by the API route path as a plain string (`'/api/shoppinglog/categories'`, `'/api/shoppinglog/cart'`, etc.) — the registry keeps every string unchanged.
- Zero `.tsx` component tests exist in this repo. **Every fetcher in this registry calls `apiFetch`, which transitively imports `components/ui/use-toast.tsx`.** Its test file MUST `vi.mock('@/lib/apiFetch', ...)` before importing `./queries`, exactly like `lib/moneylog/queries.test.ts` and `lib/travellog/queries.test.ts` do.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.

---

## File Structure

New files:
- `lib/shoppinglog/queries.ts` — ShoppingLog's query registry: `categoriesQuery`, `statsQuery`, `myListingsQuery`, `cartQuery`.
- `lib/shoppinglog/queries.test.ts` — Vitest coverage for all four fetchers/factories.
- `app/(shoppinglog)/shoppinglog/loading.tsx` — Suspense fallback for `/shoppinglog/*`.

Modified files:
- `components/ShoppingLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(shoppinglog)/shoppinglog/page.tsx` (Browse) — consume `categoriesQuery` and `statsQuery` instead of its own local fetchers. The dynamic listings query stays untouched — see the plan's Architecture note.
- `app/(shoppinglog)/shoppinglog/sell/page.tsx` — consume `categoriesQuery` (de-duplicating the copy from Browse) and `myListingsQuery` instead of its own local fetchers.
- `app/(shoppinglog)/shoppinglog/cart/page.tsx` — consume `cartQuery` instead of its own inline key/fetcher.

No deep page in scope — ShoppingLog's three nav tabs (Browse, Sell, Cart) cover the app's full surface, matching the spec's original scope table. Listing detail pages (linked from Browse/Sell cards) are not a nav destination and stay untouched.

---

## Task 1: ShoppingLog query registry

**Files:**
- Create: `lib/shoppinglog/queries.ts`
- Test: `lib/shoppinglog/queries.test.ts`

**Interfaces:**
- Consumes: `Category` (existing, `app/(shoppinglog)/shoppinglog/_components/CategoryChips.tsx`), `ListingSummary` (existing, `app/(shoppinglog)/shoppinglog/_components/ListingCard.tsx`).
- Produces:
  - `fetchCategories(): Promise<{ categories: Category[] }>`
  - `categoriesQuery(): { key: string; fetcher: () => Promise<{ categories: Category[] }> }`
  - `fetchStats(): Promise<{ activeListings: number; ordersThisMonth: number }>`
  - `statsQuery(): { key: string; fetcher: () => Promise<{ activeListings: number; ordersThisMonth: number }> }`
  - `fetchMyListings(): Promise<{ listings: ListingSummary[] }>`
  - `myListingsQuery(): { key: string; fetcher: () => Promise<{ listings: ListingSummary[] }> }`
  - `type CartItem = { cartItemId: string; quantity: number; listing: { id: string; title: string; price: number; stockQuantity: number; status: string; seller: { id: string; username: string } | null; coverImageUrl: string | null } }`
  - `fetchCart(): Promise<{ items: CartItem[] }>`
  - `cartQuery(): { key: string; fetcher: () => Promise<{ items: CartItem[] }> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/shoppinglog/queries.ts
//
// Single source of truth for ShoppingLog's preloadable page queries — same
// pattern as the six prior registries. `categoriesQuery` in particular
// replaces a fetcher that was copy-pasted verbatim into both page.tsx
// (Browse) and sell/page.tsx before this file existed — same key in both
// (so no double-fetch bug), but the same query logic duplicated across two
// files instead of shared.
import { apiFetch } from '@/lib/apiFetch';
import type { Category } from '@/app/(shoppinglog)/shoppinglog/_components/CategoryChips';
import type { ListingSummary } from '@/app/(shoppinglog)/shoppinglog/_components/ListingCard';

export async function fetchCategories(): Promise<{ categories: Category[] }> {
  const res = await apiFetch('/api/shoppinglog/categories');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function categoriesQuery() {
  return {
    key: '/api/shoppinglog/categories',
    fetcher: fetchCategories,
  };
}

export async function fetchStats(): Promise<{ activeListings: number; ordersThisMonth: number }> {
  const res = await apiFetch('/api/shoppinglog/stats');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function statsQuery() {
  return {
    key: '/api/shoppinglog/stats',
    fetcher: fetchStats,
  };
}

export async function fetchMyListings(): Promise<{ listings: ListingSummary[] }> {
  const res = await apiFetch('/api/shoppinglog/listings?mine=1');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function myListingsQuery() {
  return {
    key: '/api/shoppinglog/listings?mine=1',
    fetcher: fetchMyListings,
  };
}

export type CartItem = {
  cartItemId: string;
  quantity: number;
  listing: {
    id: string;
    title: string;
    price: number;
    stockQuantity: number;
    status: string;
    seller: { id: string; username: string } | null;
    coverImageUrl: string | null;
  };
};

export async function fetchCart(): Promise<{ items: CartItem[] }> {
  const res = await apiFetch('/api/shoppinglog/cart');
  if (!res.ok) throw new Error('Failed to load cart');
  return res.json();
}

export function cartQuery() {
  return {
    key: '/api/shoppinglog/cart',
    fetcher: fetchCart,
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/shoppinglog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// Every fetcher here calls apiFetch (lib/apiFetch.ts), which transitively
// imports components/ui/use-toast.tsx for its error-toast side effect — a
// real .tsx file this repo's Vitest setup has never needed to transform.
// Mocking the module before `./queries` imports it keeps that file out of
// the test's module graph entirely (same fix as the MoneyLog/TravelLog
// registry tests).
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const { fetchCategories, fetchStats, fetchMyListings, fetchCart, categoriesQuery, statsQuery, myListingsQuery, cartQuery } =
  await import('./queries');

describe('fetchCategories', () => {
  it('returns the parsed categories payload on success', async () => {
    const payload = { categories: [{ id: 'c1', name: 'Electronics', slug: 'electronics', icon: 'Smartphone' }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchCategories();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchCategories()).rejects.toThrow('Failed to load');
  });
});

describe('fetchStats', () => {
  it('returns the parsed stats payload on success', async () => {
    const payload = { activeListings: 3, ordersThisMonth: 1 };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchStats();
    expect(result).toEqual(payload);
  });
});

describe('fetchMyListings', () => {
  it('returns the seller\'s own listings', async () => {
    const payload = { listings: [{ id: 'l1', title: 'Road Bike', price: 450 }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchMyListings();
    expect(result).toEqual(payload);
  });
});

describe('fetchCart', () => {
  it('returns the cart items on success', async () => {
    const payload = { items: [{ cartItemId: 'ci1', quantity: 2, listing: { id: 'l1', title: 'Road Bike', price: 450, stockQuantity: 1, status: 'active', seller: null, coverImageUrl: null } }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchCart();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchCart()).rejects.toThrow('Failed to load cart');
  });
});

describe('registry key shapes', () => {
  it('categoriesQuery keys by the API route path', () => {
    expect(categoriesQuery().key).toBe('/api/shoppinglog/categories');
  });

  it('statsQuery keys by the API route path', () => {
    expect(statsQuery().key).toBe('/api/shoppinglog/stats');
  });

  it('myListingsQuery keys by the API route path with the mine=1 query param', () => {
    expect(myListingsQuery().key).toBe('/api/shoppinglog/listings?mine=1');
  });

  it('cartQuery keys by the API route path', () => {
    expect(cartQuery().key).toBe('/api/shoppinglog/cart');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/shoppinglog/queries.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/shoppinglog/queries"` — expect no output.
Run: `npx eslint lib/shoppinglog/queries.ts lib/shoppinglog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/shoppinglog/queries.ts lib/shoppinglog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add ShoppingLog query registry (categories, stats, my listings, cart)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (Browse) to `categoriesQuery`/`statsQuery`

**Files:**
- Modify: `app/(shoppinglog)/shoppinglog/page.tsx`

**Interfaces:**
- Consumes: `categoriesQuery`, `statsQuery` (Task 1).

- [ ] **Step 1: Replace the categories and stats fetches, leave listings untouched**

Change:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { CategoryChips, type Category } from './_components/CategoryChips';
import { ListingCard, type ListingSummary } from './_components/ListingCard';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function ShoppingLogBrowsePage() {
```

to:

```tsx
import { CategoryChips, type Category } from './_components/CategoryChips';
import { ListingCard, type ListingSummary } from './_components/ListingCard';
import { categoriesQuery, statsQuery } from '@/lib/shoppinglog/queries';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function ShoppingLogBrowsePage() {
```

`apiFetch` and the local `fetcher` function both stay — the dynamic listings query (`` `/api/shoppinglog/listings?${params}` ``) still needs `fetcher`, and the checkout/refresh handlers elsewhere in this page may still call `apiFetch` directly. Only `Category` stays imported as a type (still needed for `categoryData`'s shape via the registry's return type); nothing here is removed except the two fetches below.

Change:

```tsx
  const { data: categoryData } = useSWR<{ categories: Category[] }>('/api/shoppinglog/categories', fetcher);
```

to:

```tsx
  const { data: categoryData } = useSWR<{ categories: Category[] }>(categoriesQuery().key, categoriesQuery().fetcher);
```

Change:

```tsx
  const { data: stats } = useSWR<{ activeListings: number; ordersThisMonth: number }>(
    '/api/shoppinglog/stats',
    fetcher
  );
```

to:

```tsx
  const { data: stats } = useSWR<{ activeListings: number; ordersThisMonth: number }>(
    statsQuery().key,
    statsQuery().fetcher
  );
```

The listings query (`` `/api/shoppinglog/listings?${params.toString()}` ``, `fetcher`) is unchanged — deliberately left as page-internal state per this plan's Architecture note. `ListingSummary` stays imported, still used by that query's type and `ListingCard`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "\(shoppinglog\)/shoppinglog/page"` — expect no output.
Run: `npx eslint "app/(shoppinglog)/shoppinglog/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(shoppinglog)/shoppinglog/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: browse page consumes shared categoriesQuery/statsQuery registry entries

categoriesQuery unifies the same key sell/page.tsx also fetches under its
own copy-pasted fetcher (deduplicated in the next commit). The dynamic
listings search/filter query stays page-internal — not a stable nav
destination to preload.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `sell/page.tsx` to `categoriesQuery`/`myListingsQuery`

**Files:**
- Modify: `app/(shoppinglog)/shoppinglog/sell/page.tsx`

**Interfaces:**
- Consumes: `categoriesQuery`, `myListingsQuery` (Task 1).

- [ ] **Step 1: Replace both fetches**

Change:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { ListingForm, type ListingFormValues } from '../_components/ListingForm';
import { ListingCard, type ListingSummary } from '../_components/ListingCard';
import type { Category } from '../_components/CategoryChips';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function SellPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: categoryData } = useSWR<{ categories: Category[] }>('/api/shoppinglog/categories', fetcher);
  const { data: myListingsData, mutate } = useSWR<{ listings: ListingSummary[] }>('/api/shoppinglog/listings?mine=1', fetcher);
```

to:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { ListingForm, type ListingFormValues } from '../_components/ListingForm';
import { ListingCard, type ListingSummary } from '../_components/ListingCard';
import type { Category } from '../_components/CategoryChips';
import { categoriesQuery, myListingsQuery } from '@/lib/shoppinglog/queries';

export default function SellPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: categoryData } = useSWR<{ categories: Category[] }>(categoriesQuery().key, categoriesQuery().fetcher);
  const { data: myListingsData, mutate } = useSWR<{ listings: ListingSummary[] }>(myListingsQuery().key, myListingsQuery().fetcher);
```

(`apiFetch` stays imported — `handleCreate` below still POSTs through it directly. The local `fetcher` function is fully removed since nothing else in this file used it.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sell/page"` — expect no output.
Run: `npx eslint "app/(shoppinglog)/shoppinglog/sell/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(shoppinglog)/shoppinglog/sell/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: sell page consumes shared categoriesQuery/myListingsQuery registry entries

De-duplicates the categories fetcher this page previously copy-pasted
verbatim from the browse page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `cart/page.tsx` to `cartQuery`

**Files:**
- Modify: `app/(shoppinglog)/shoppinglog/cart/page.tsx`

**Interfaces:**
- Consumes: `cartQuery`, `type CartItem` (Task 1).

- [ ] **Step 1: Swap the inline key/fetcher and local type for the registry entry**

Change:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';
import { usePayment } from '@/lib/moneylog/paymentContext';

type CartItem = {
  cartItemId: string;
  quantity: number;
  listing: {
    id: string;
    title: string;
    price: number;
    stockQuantity: number;
    status: string;
    seller: { id: string; username: string } | null;
    coverImageUrl: string | null;
  };
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load cart');
  return res.json();
}

export default function CartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: CartItem[] }>('/api/shoppinglog/cart', fetcher);
```

to:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';
import { usePayment } from '@/lib/moneylog/paymentContext';
import { cartQuery, type CartItem } from '@/lib/shoppinglog/queries';

export default function CartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: CartItem[] }>(cartQuery().key, cartQuery().fetcher);
```

(`apiFetch` stays imported — `remove` and the checkout handler below still call it directly.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "cart/page"` — expect no output.
Run: `npx eslint "app/(shoppinglog)/shoppinglog/cart/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(shoppinglog)/shoppinglog/cart/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: cart page consumes shared cartQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Prefetch + preload wiring in `ShoppingLogBottomNav`

**Files:**
- Modify: `components/ShoppingLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `categoriesQuery`/`statsQuery`/`myListingsQuery`/`cartQuery` (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/ShoppingLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusCircleIcon, ShoppingCartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/shoppinglog', label: 'Browse', Icon: null },
  { href: '/shoppinglog/sell', label: 'Sell', Icon: PlusCircleIcon },
  { href: '/shoppinglog/cart', label: 'Cart', Icon: ShoppingCartIcon },
];

export function ShoppingLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/shoppinglog/config' || pathname.startsWith('/shoppinglog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/shoppinglog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
```

to:

```tsx
// components/ShoppingLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusCircleIcon, ShoppingCartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { categoriesQuery, statsQuery, myListingsQuery, cartQuery } from '@/lib/shoppinglog/queries';

const tabs = [
  { href: '/shoppinglog', label: 'Browse', Icon: null },
  { href: '/shoppinglog/sell', label: 'Sell', Icon: PlusCircleIcon },
  { href: '/shoppinglog/cart', label: 'Cart', Icon: ShoppingCartIcon },
];

export function ShoppingLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/shoppinglog/config' || pathname.startsWith('/shoppinglog/config/');

  // Warms Browse's categories/stats, Sell's categories (shared)/my listings,
  // and the Cart. No useCurrentProfile() needed here — every one of this
  // app's queries is session-scoped server-side via the API route, not
  // parameterized by profileId client-side.
  usePreloadRoutes([categoriesQuery(), statsQuery(), myListingsQuery(), cartQuery()]);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/shoppinglog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
```

Note this app's preload call needs no `useCurrentProfile()`/`profile` gate the way every other app's did — every ShoppingLog query is a plain string key with no profileId parameter, so it's safe to preload unconditionally on every mount of the nav (the API routes themselves 401 harmlessly if unauthenticated, same as any other unauthenticated fetch this app would make).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "ShoppingLogBottomNav"` — expect no output.
Run: `npx eslint components/ShoppingLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, land on `/shoppinglog`. Wait ~1 second, then tap "Sell" and "Cart" in sequence. Confirm: no new `/api/shoppinglog/categories`, `/api/shoppinglog/listings?mine=1`, or `/api/shoppinglog/cart` request fires for either, and both render with no loading skeleton flash for those specific queries (Browse's search-filtered listings still load fresh each visit — that's the explicitly out-of-scope part, not a bug).

- [ ] **Step 4: Commit**

```bash
git add components/ShoppingLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: ShoppingLogBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: `loading.tsx` for ShoppingLog + full verification pass

**Files:**
- Create: `app/(shoppinglog)/shoppinglog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(shoppinglog)/shoppinglog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function ShoppingLogLoading() {
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

Same generic shape as the prior six apps' `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "shoppinglog/loading"` — expect no output.
Run: `npx eslint "app/(shoppinglog)/shoppinglog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/shoppinglog/cart` via URL bar, confirm `ShoppingLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(shoppinglog)/**/*.tsx" "lib/shoppinglog/**/*.ts" components/ShoppingLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(shoppinglog)/shoppinglog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /shoppinglog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** all three ShoppingLog nav tabs addressed (Tasks 2–4), prefetch + preload wiring (Task 5), `loading.tsx` (Task 6). No deep page in scope, matching the spec's original table.
- **A real duplication found and fixed, not left as latent debt:** `categoriesQuery`'s fetcher was copy-pasted verbatim into Browse and Sell — same pattern, same non-bug-but-real-risk as TravelLog's `fetchVisits`. Fixed across Tasks 2–3.
- **One dimension unique to this app, called out rather than silently assumed:** every query here is session-scoped server-side (the API routes read the caller's identity from cookies), so unlike every other app's registry, none of ShoppingLog's `xQuery()` factories take a `profileId` parameter — and the nav's preload wiring (Task 5) correctly needs no `useCurrentProfile()` gate as a result. Stated explicitly in Task 5 rather than left as an unexplained asymmetry with the other six plans.
- **Type consistency check:** `CartItem` (registry) is a verbatim copy of the type `cart/page.tsx` previously declared locally — Task 4 imports it from the registry instead of redeclaring it, and every field the page already read (`cartItemId`, `quantity`, `listing.*`) stays present. `Category`/`ListingSummary` are imported from their existing homes (`CategoryChips.tsx`/`ListingCard.tsx`) rather than redefined a third time.
