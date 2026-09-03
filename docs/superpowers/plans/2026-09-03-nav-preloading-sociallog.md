# Nav Preloading — SocialLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to SocialLog: nav-link prefetch, a query registry, converting SocialLog's one preloadable page-level query per relevant tab to it, wiring the preload into `SocialLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as the seven prior apps, but SocialLog has the smallest registry of the series: its Home feed is tab/sort-scoped (`` `/api/sociallog/posts?tab=${tab}&sort=${sort}` ``, changes on every filter tap — the same "page-internal UI state" exclusion as ShoppingLog's listings and BurnLog's `useFinanceData`) and its Search tab has no page-level `useSWR` call at all (it's a type-to-search page with no stable query to preload). Only two genuinely stable, nav-preloadable queries exist in this app: Home's follower/post `stats` and Messages' `threads` list. No duplication or key-collision drift was found here — this is pure extraction and wiring, like TaskLog's and LearnLog's plans.

**Tech Stack:** Next.js App Router, `swr@2.5.1`, `apiFetch` (`lib/apiFetch.ts`) — both fetchers in this registry go through it, so the `.tsx`-import test gotcha from the MoneyLog/TravelLog/ShoppingLog plans applies here too.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-tasklog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-travellog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-homelog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-learnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-shoppinglog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: this app already keys everything by the API route path as a plain string (`'/api/sociallog/stats'`, `'/api/sociallog/messages/threads'`) — the registry keeps both strings unchanged.
- Zero `.tsx` component tests exist in this repo. **Both fetchers in this registry call `apiFetch`, which transitively imports `components/ui/use-toast.tsx`.** The test file MUST `vi.mock('@/lib/apiFetch', ...)` before importing `./queries`, exactly like the MoneyLog/TravelLog/ShoppingLog registry tests do.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.

---

## File Structure

New files:
- `lib/sociallog/queries.ts` — SocialLog's query registry: `statsQuery`, `threadsQuery`.
- `lib/sociallog/queries.test.ts` — Vitest coverage for both fetchers/factories.
- `app/(sociallog)/sociallog/loading.tsx` — Suspense fallback for `/sociallog/*`.

Modified files:
- `components/SocialLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(sociallog)/sociallog/page.tsx` (Home) — consume `statsQuery` instead of its own inline key/fetcher. The tab/sort-scoped posts feed stays untouched — see the Architecture note.
- `app/(sociallog)/sociallog/messages/page.tsx` — consume `threadsQuery` instead of its own inline key/fetcher.

Explicitly NOT modified:
- `app/(sociallog)/sociallog/search/page.tsx` — confirmed to have no `useSWR` call at all (a search-as-you-type page with no stable page-level query). It still gets `prefetch` (Task 3) and benefits from `loading.tsx` (Task 4) like every other route, but there's nothing to add to the registry for it.

---

## Task 1: SocialLog query registry

**Files:**
- Create: `lib/sociallog/queries.ts`
- Test: `lib/sociallog/queries.test.ts`

**Interfaces:**
- Produces:
  - `fetchStats(): Promise<{ followers: number; posts: number }>`
  - `statsQuery(): { key: string; fetcher: () => Promise<{ followers: number; posts: number }> }`
  - `type Thread = { id: string; otherParticipant: { id: string; username: string; firstName: string; avatarUrl: string | null }; lastMessageAt: string; lastMessageBody: string | null }`
  - `fetchThreads(): Promise<{ threads: Thread[] }>`
  - `threadsQuery(): { key: string; fetcher: () => Promise<{ threads: Thread[] }> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/sociallog/queries.ts
//
// Single source of truth for SocialLog's preloadable page queries — same
// pattern as the seven prior registries. Deliberately small: this app's
// Home feed is tab/sort-scoped (changes on every filter tap) and Search
// has no page-level query at all — see the plan's Architecture note for
// why those two are excluded rather than forced into a registry entry.
import { apiFetch } from '@/lib/apiFetch';

export async function fetchStats(): Promise<{ followers: number; posts: number }> {
  const res = await apiFetch('/api/sociallog/stats');
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export function statsQuery() {
  return {
    key: '/api/sociallog/stats',
    fetcher: fetchStats,
  };
}

export type Thread = {
  id: string;
  otherParticipant: { id: string; username: string; firstName: string; avatarUrl: string | null };
  lastMessageAt: string;
  lastMessageBody: string | null;
};

export async function fetchThreads(): Promise<{ threads: Thread[] }> {
  const res = await apiFetch('/api/sociallog/messages/threads');
  if (!res.ok) throw new Error('Failed to load threads');
  return res.json();
}

export function threadsQuery() {
  return {
    key: '/api/sociallog/messages/threads',
    fetcher: fetchThreads,
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/sociallog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// Both fetchers call apiFetch (lib/apiFetch.ts), which transitively
// imports components/ui/use-toast.tsx for its error-toast side effect — a
// real .tsx file this repo's Vitest setup has never needed to transform.
// Mocking the module before `./queries` imports it keeps that file out of
// the test's module graph entirely (same fix as the MoneyLog/TravelLog/
// ShoppingLog registry tests).
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const { fetchStats, fetchThreads, statsQuery, threadsQuery } = await import('./queries');

describe('fetchStats', () => {
  it('returns the parsed stats payload on success', async () => {
    const payload = { followers: 42, posts: 7 };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchStats();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchStats()).rejects.toThrow('Failed to load feed');
  });
});

describe('fetchThreads', () => {
  it('returns the parsed threads payload on success', async () => {
    const payload = {
      threads: [
        {
          id: 't1',
          otherParticipant: { id: 'p1', username: 'sam', firstName: 'Sam', avatarUrl: null },
          lastMessageAt: '2026-09-01T00:00:00Z',
          lastMessageBody: 'hey!',
        },
      ],
    };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchThreads();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchThreads()).rejects.toThrow('Failed to load threads');
  });
});

describe('registry key shapes', () => {
  it('statsQuery keys by the API route path', () => {
    expect(statsQuery().key).toBe('/api/sociallog/stats');
  });

  it('threadsQuery keys by the API route path', () => {
    expect(threadsQuery().key).toBe('/api/sociallog/messages/threads');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/sociallog/queries.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/sociallog/queries"` — expect no output.
Run: `npx eslint lib/sociallog/queries.ts lib/sociallog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/sociallog/queries.ts lib/sociallog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add SocialLog query registry (stats, message threads)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (Home) to `statsQuery`

**Files:**
- Modify: `app/(sociallog)/sociallog/page.tsx`

**Interfaces:**
- Consumes: `statsQuery` (Task 1).

- [ ] **Step 1: Replace the stats fetch, leave the feed untouched**

Change:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { StatCard } from '@/components/ui/stat-card';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export default function SocialLogDashboardPage() {
  const { profile } = useCurrentProfile();
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');

  const { data, isLoading, mutate } = useSWR<{ posts: FeedPost[] }>(
    `/api/sociallog/posts?tab=${tab}&sort=${sort}`,
    fetcher
  );
  const { data: stats } = useSWR<{ followers: number; posts: number }>(
    profile ? '/api/sociallog/stats' : null,
    fetcher
  );
```

to:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { StatCard } from '@/components/ui/stat-card';
import { statsQuery } from '@/lib/sociallog/queries';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export default function SocialLogDashboardPage() {
  const { profile } = useCurrentProfile();
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');

  const { data, isLoading, mutate } = useSWR<{ posts: FeedPost[] }>(
    `/api/sociallog/posts?tab=${tab}&sort=${sort}`,
    fetcher
  );
  const { data: stats } = useSWR<{ followers: number; posts: number }>(
    profile ? statsQuery().key : null,
    profile ? statsQuery().fetcher : null
  );
```

`apiFetch` and the local `fetcher` both stay — the tab/sort-scoped feed query still needs `fetcher` directly, and other handlers on this page (compose, refresh) may call `apiFetch` directly too.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "\(sociallog\)/sociallog/page"` — expect no output.
Run: `npx eslint "app/(sociallog)/sociallog/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(sociallog)/sociallog/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: SocialLog home page consumes shared statsQuery registry entry

The tab/sort-scoped posts feed stays page-internal — not a stable nav
destination to preload.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `messages/page.tsx` to `threadsQuery`

**Files:**
- Modify: `app/(sociallog)/sociallog/messages/page.tsx`

**Interfaces:**
- Consumes: `threadsQuery`, `type Thread` (Task 1).

- [ ] **Step 1: Swap the inline key/fetcher and local type for the registry entry**

Change:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';
import { ChatEmptyIllustration } from '@/components/sociallog/ChatEmptyIllustration';

type Thread = {
  id: string;
  otherParticipant: { id: string; username: string; firstName: string; avatarUrl: string | null };
  lastMessageAt: string;
  lastMessageBody: string | null;
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load threads');
  return res.json();
}

export default function SocialLogMessagesPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ threads: Thread[] }>('/api/sociallog/messages/threads', fetcher);
```

to:

```tsx
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';
import { ChatEmptyIllustration } from '@/components/sociallog/ChatEmptyIllustration';
import { threadsQuery, type Thread } from '@/lib/sociallog/queries';

export default function SocialLogMessagesPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ threads: Thread[] }>(threadsQuery().key, threadsQuery().fetcher);
```

Check whether `apiFetch` is still used elsewhere in this file (e.g. a "start new conversation" or "delete thread" handler) before dropping its import — run `grep -n "apiFetch" "app/(sociallog)/sociallog/messages/page.tsx"` and keep the import if anything besides the deleted fetcher used it.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "messages/page"` — expect no output.
Run: `npx eslint "app/(sociallog)/sociallog/messages/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(sociallog)/sociallog/messages/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: messages page consumes shared threadsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Prefetch + preload wiring in `SocialLogBottomNav`

**Files:**
- Modify: `components/SocialLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `statsQuery`/`threadsQuery` (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/SocialLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/sociallog', label: 'Home', Icon: null },
  { href: '/sociallog/search', label: 'Search', Icon: SearchIcon },
  { href: '/sociallog/messages', label: 'Messages', Icon: MessageCircleIcon },
];

export function SocialLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/sociallog/config' || pathname.startsWith('/sociallog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/sociallog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
```

to:

```tsx
// components/SocialLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { statsQuery, threadsQuery } from '@/lib/sociallog/queries';

const tabs = [
  { href: '/sociallog', label: 'Home', Icon: null },
  { href: '/sociallog/search', label: 'Search', Icon: SearchIcon },
  { href: '/sociallog/messages', label: 'Messages', Icon: MessageCircleIcon },
];

export function SocialLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/sociallog/config' || pathname.startsWith('/sociallog/config/');

  // Warms Home's stats and Messages' thread list. Search has no
  // page-level query (search-as-you-type, no stable key to preload).
  // Session-scoped server-side like ShoppingLog — no useCurrentProfile()
  // gate needed for the preload call itself.
  usePreloadRoutes([statsQuery(), threadsQuery()]);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/sociallog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "SocialLogBottomNav"` — expect no output.
Run: `npx eslint components/SocialLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, land on `/sociallog`. Wait ~1 second, then tap "Messages". Confirm: no new `/api/sociallog/messages/threads` request fires, and it renders with no loading skeleton flash.

- [ ] **Step 4: Commit**

```bash
git add components/SocialLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: SocialLogBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: `loading.tsx` for SocialLog + full verification pass

**Files:**
- Create: `app/(sociallog)/sociallog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(sociallog)/sociallog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function SocialLogLoading() {
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

Same generic shape as the prior seven apps' `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sociallog/loading"` — expect no output.
Run: `npx eslint "app/(sociallog)/sociallog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/sociallog/messages` via URL bar, confirm `SocialLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(sociallog)/**/*.tsx" "lib/sociallog/**/*.ts" components/SocialLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(sociallog)/sociallog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /sociallog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** SocialLog's two genuinely stable, preloadable page-level queries (Home's `stats`, Messages' `threads`) are converted (Tasks 2–3); the two that aren't (Home's tab/sort-scoped feed, Search's no-query page) are explicitly named as out of scope with a reason, not silently skipped. Prefetch + preload wiring (Task 4) and `loading.tsx` (Task 5) mirror the prior seven plans.
- **No drift bug found here** — stated plainly, matching TaskLog's and LearnLog's plans; SocialLog's two stable queries were each uniquely keyed with no collision before this plan touched them.
- **Type consistency check:** `Thread` (registry) is a verbatim copy of the type `messages/page.tsx` previously declared locally — Task 3 imports it from the registry instead of redeclaring it, and every field the page already read (`id`, `otherParticipant.*`, `lastMessageAt`, `lastMessageBody`) stays present.
