# Navigation preloading — design spec

Date: 2026-09-03
Status: draft, pending review

## Problem

Switching tabs inside a sub-app (e.g. BurnLog's Dashboard → Session → Goals →
Insights) triggers a full serial fetch chain on every single navigation, even
between the same handful of screens a user revisits all day:

```
middleware: auth.getUser() → profiles select   (blocking, every request)
  → route JS chunk                              (not prefetched on 8/9 apps)
  → RSC payload for the route
  → page mounts client-side:
      auth.getUser() again → profiles select again
      → the page's own Supabase query
```

Two root causes, confirmed by inventory of this repo:

1. **Only BurnLog's bottom nav prefetches.** All 8 other apps'
   `*BottomNav.tsx` components (`MoneyLogBottomNav`, `TaskLogBottomNav`,
   `TravelLogBottomNav`, `HomeLogBottomNav`, `LearnLogBottomNav`,
   `ShoppingLogBottomNav`, `SocialLogBottomNav`, `LogbookBottomNav`) render
   plain `<Link href={...}>` with no `prefetch` prop, and the shared
   `ConfigMenu`/`ProfileMenu` components (rendered in every nav) don't either.
2. **41 of 80 pages fetch data directly** (`createClient()` +
   `supabase.from(...)` inside a `useEffect`) instead of going through a
   cache. Only 38 pages use `useSWR`. A route can be code-prefetched all day
   and still show a spinner if its data isn't behind a cache that can be
   warmed ahead of navigation.

A partial fix already exists and sets the pattern to extend:
`lib/useCurrentProfile.ts` is a shared SWR-cached `getUser()` + `profiles`
row fetch (key `'current-profile'`), and the global `SWRConfig` in
`app/RootLayoutClient.tsx` already sets `keepPreviousData: true` and
`dedupingInterval: 3000` — so once a page's data is behind an SWR key,
revisiting it is already closer to instant. Most pages just don't use it yet.

Also confirmed: **zero `loading.tsx` files exist anywhere in `app/`.** Without
one, Next's default `prefetch` on a dynamic route only prefetches partially
(the static shell), so simply adding `prefetch` to existing `<Link>`s is not
sufficient on its own.

**Out of scope, flagged for follow-up:** `middleware.ts` runs a live
`supabase.auth.getUser()` and a `profiles` select on every single request,
including every prefetch request Next fires. This is the single largest
remaining per-navigation cost, and no prefetch strategy removes it — but
reworking auth middleware is a separate, higher-risk piece of work the user
explicitly deferred out of this spec.

## Goals

- Tapping a bottom-nav tab (or a handful of high-traffic deep links) shows
  content immediately, with no spinner, for pages the user is likely to
  visit next.
- Reuse one mechanism across all 9 sub-apps rather than one-off fixes.
- Every page this spec touches ends up on the same `useSWR` + shared-key
  pattern `useCurrentProfile` already established, so revisits are cache
  hits by construction, not by preload luck.

## Non-goals

- Converting all 41 raw-fetch pages (deep/detail/config pages not listed in
  scope below stay as they are).
- Reworking `middleware.ts`'s per-request auth check.
- Introducing a new state-management library. SWR is already the house
  pattern (`useCurrentProfile`, this session's BurnLog `session`/`goals`
  conversion) and already ships `preload()` (confirmed: `swr@2.5.1`, no
  version bump needed).

## Scope: pages converted + preloaded

"Nav tabs" = every route in each app's bottom nav. "Deep pages" = the one or
two screens with a single, unambiguous high-traffic entry point from that
app's home tab, confirmed by grep (not guessed):

| App | Nav tabs | Deep pages |
|---|---|---|
| BurnLog | `/burnlog/dashboard`, `/session`, `/goals`, `/insights` | `/burnlog/meal-planner` (linked from dashboard) |
| MoneyLog | `/moneylog`, `/plan`, `/goals`, `/insights` | `/moneylog/assets` (linked from `NetWorthCard` on home) |
| TaskLog | `/tasklog`, `/board`, `/plan`, `/goals` | — |
| TravelLog | `/travellog`, `/map`, `/trips`, `/plan`, `/suggestions` | — |
| HomeLog | `/homelog`, `/chores`, `/inventory`, `/bills` | — |
| LearnLog | `/learnlog`, `/library`, `/skills`, `/career`, `/reflections` | — |
| ShoppingLog | `/shoppinglog`, `/sell`, `/cart` | — |
| SocialLog | `/sociallog`, `/search`, `/messages` | — |
| LogBook | `/logbook`, `/logbook/myday` | — |

(`/profile` and every app's `/config` page are reached via `ConfigMenu`/
`ProfileMenu`, shared components — those get `prefetch` too, but their pages
are settings screens visited rarely per session and are **not** added to the
data-preload list, only the code-prefetch list.)

Deep-page list intentionally stays short. The mechanism (registry entry +
one line in the app's preload call) is cheap to extend later; this spec
doesn't try to guess every hot path across 9 apps.

## Architecture

### 1. Per-app query registry (new)

One new file per app, `lib/<app>/queries.ts` (7 of 9 `lib/<app>/` dirs
already exist; `lib/shoppinglog/` and any others get created), exporting a
`key(...) => SWRKey` + `fetcher(...)` pair per preloadable page, e.g.:

```ts
// lib/moneylog/queries.ts
export const moneyLogHomeQuery = (profileId: string) => ({
  key: ['moneylog-home', profileId] as const,
  fetcher: async () => { /* the exact query moneylog/page.tsx runs today */ },
});

export const moneyLogAssetsQuery = (profileId: string) => ({
  key: ['moneylog-assets', profileId] as const,
  fetcher: async () => { /* ... */ },
});
```

Each page's own `useSWR(query.key, query.fetcher)` call and the preloader's
`preload(query.key, query.fetcher)` call both come from the same registry
entry — key and fetcher can never drift apart, which is the failure mode
that makes ad-hoc preloading unreliable.

Key naming follows the convention already used this session
(`burnlog-workout-plan`, `burnlog-goals`, `burnlog-session-profile`):
`` `${app}-${resource}` `` as the first tuple element, `profileId` (and any
further params, e.g. `day`) after it — consistent with `CURRENT_PROFILE_KEY`
being the one profile-wide exception (no per-app prefix, since it's shared
across every app).

### 2. Page conversion

Every page in the scope table that still does a raw
`useEffect`-`createClient()`-`supabase.from(...)` fetch is converted to
`useSWR(...)` against its registry entry, following the exact pattern this
session already used for BurnLog's `session/page.tsx` and `goals/page.tsx`:
`auth.getUser()` stays a cheap one-off effect for `userId`; everything after
that (profile row, page data) becomes an `SWR` call gated on `userId` /
`profileId` being present (`key: userId ? [...] : null`).

Where a page already uses `useCurrentProfile()` for the profile row, that
stays as-is — only the page-specific data query moves into the registry.

### 3. Preload hook (new)

```ts
// lib/usePreloadRoutes.ts
import { preload } from 'swr';

export function usePreloadRoutes(queries: Array<{ key: unknown; fetcher: () => Promise<unknown> }>) {
  useEffect(() => {
    const id = requestIdleCallback
      ? requestIdleCallback(() => queries.forEach(q => preload(q.key, q.fetcher)))
      : setTimeout(() => queries.forEach(q => preload(q.key, q.fetcher)), 200);
    return () => (requestIdleCallback ? cancelIdleCallback(id) : clearTimeout(id));
  }, [queries]);
}
```

Each app's bottom nav calls this once, after it has `profileId` (from
`useCurrentProfile()`, which every nav already has access to or gains
access to), with the registry entries for its *other* tabs (not the one
currently active — no point preloading the page you're already on) plus its
deep pages. Runs on idle, not on mount, so it never competes with the
current page's own first paint.

This also naturally rate-limits itself: `dedupingInterval: 3000` in the
global `SWRConfig` means a preload immediately followed by the real
navigation's `useSWR` call collapses into the one in-flight request instead
of firing twice.

### 4. Code prefetch — every nav, everywhere

- Add `prefetch` to every `<Link>` in all 9 `*BottomNav.tsx` files, plus
  `ConfigMenu.tsx` and `ProfileMenu.tsx` (shared, so one change covers 8
  apps' settings link and every app's profile link).
- `LogbookBottomNav.tsx` uses inline `<Link href="...">` instead of the
  `tabs.map(...)` pattern the other 8 use — same one-line change, just at
  two call sites instead of a `.map`.

### 5. `loading.tsx` per app

One `app/(<app>)/<app>/loading.tsx` per app (9 files), rendering the same
`Skeleton` shapes each page already shows during its own `loading` state
today (e.g. BurnLog session's existing skeleton block gets promoted from
inline JSX to the route-level file). This is what makes `prefetch` on
dynamic routes actually prefetch the full RSC payload instead of the static
shell only — confirmed as the reason zero `loading.tsx` files is a real gap,
not a cosmetic one.

## Data flow, end to end

```
User lands on /moneylog (nav mounts)
  → useCurrentProfile() resolves profileId (already cached globally)
  → usePreloadRoutes() fires on idle: preload(plan), preload(goals), preload(insights), preload(assets)
  → user taps "Goals" tab
       Link prefetch already warmed the route chunk + RSC shell (loading.tsx makes this a full prefetch)
       useSWR(goalsQuery.key, ...) in goals/page.tsx finds the preloaded cache entry → renders immediately
```

## Risks

- **Extra background reads.** Preloading every sibling tab on every nav
  visit multiplies Supabase reads. Mitigated by: only firing on idle (never
  competes with the active page), `dedupingInterval` collapsing
  double-fetches, and keeping the deep-page list short rather than
  preloading every reachable route.
- **Registry/page drift.** If a page's `useSWR` call and the registry
  fetcher diverge, the preload does nothing useful. Mitigated by construction
  — both call sites import the same registry function, not separate copies.
- **`requestIdleCallback` isn't available in Safari** (confirmed gap in
  the Fetch/idle API landscape) — the hook needs the `setTimeout` fallback
  shown above; this is not optional given the app's PWA/mobile-first usage.
- **Stale-while-revalidate surprises.** `keepPreviousData: true` (already
  the global default) means a preloaded-then-stale value can flash before
  revalidating. Existing behavior, not new risk introduced by this spec —
  noted so it isn't mistaken for a regression during review.

## Testing / verification

- `tsc --noEmit`, `eslint` on every touched file, full `vitest run` — same
  bar as every change made earlier in this session.
- Manual: for each of the 9 apps, confirm via Network tab that tapping a
  nav tab after a few seconds' dwell on a sibling tab shows no
  loading-spinner flash and issues no new request (cache hit).
- Confirm `loading.tsx` renders correctly on a hard navigation
  (throttled network, direct URL entry) — it must not regress the
  non-preloaded first-visit path.

## Follow-up (explicitly out of scope here)

- `middleware.ts`: the per-request `auth.getUser()` + `profiles` select is
  the largest remaining fixed cost per navigation and isn't touched by
  anything in this spec. A future spec could look at trusting a
  short-lived signed cookie between middleware and the shared
  `useCurrentProfile` fetch instead of re-querying `profiles` twice.
- Extending the registry/preload pattern to the remaining ~35 raw-fetch
  pages not listed in the scope table (detail/config screens), once this
  pattern has proven itself on the high-traffic tabs.
