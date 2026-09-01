# Onboarding Foundation — Design Spec

Sub-project 2.0 of the "Logbook as platform hub" initiative (see
`docs/superpowers/specs/2026-08-31-identity-consolidation-design.md`
for the full initiative). Full plan for sub-project 2: (2.0) this
foundation — app selection + orchestrator + `enabledApps` tracking,
reusing BurnLog's and MoneyLog's existing onboarding flows as-is; then
(2.1)–(2.4) new AI-driven onboarding content for TaskLog, HomeLog,
SocialLog, and ShoppingLog, each built on top of this foundation and
each getting its own brainstorm → spec → plan cycle. Sub-project 3
(shared cross-app feature layer) remains out of scope entirely.

## Problem

New-user signup is hardcoded to a single app: `/signup` → `/signup/profile`
(collects firstName/lastName/age/weight/height/activityLevel) →
`router.push('/ai-setup')` (BurnLog's AI onboarding, unconditionally).
There is no concept of "which apps does this user want" anywhere in
the codebase — `AppSwitcher` always renders all 7 `APPS` entries
regardless of what the user actually uses. MoneyLog has its own
onboarding (`/moneylog/onboarding`, a budget wizard) but nothing ever
routes a new user into it — a user only reaches it by navigating to
MoneyLog manually and finding the flow themselves. TaskLog, HomeLog,
SocialLog, and ShoppingLog have no onboarding at all.

## Goal

- After creating their base profile, a new user is shown an app
  selection screen (in Logbook's flow) and picks which sub-apps they
  want.
- Selected apps with existing onboarding (BurnLog, MoneyLog) are
  sequenced through automatically, one after another, ending back in
  Logbook.
- Selected apps without onboarding yet (TaskLog, HomeLog, SocialLog,
  ShoppingLog) are simply marked enabled — their own AI onboarding
  arrives in sub-projects 2.1–2.4, reusing this same orchestrator.
- Which apps a user has enabled is persisted and used to filter what
  `AppSwitcher` shows them.
- Existing users keep seeing every app (no regression) and get a way
  to enable additional apps later, reusing the same orchestrator for
  just the newly added app.

## Non-goals

- Building new onboarding *content* for TaskLog/HomeLog/SocialLog/
  ShoppingLog — that's sub-projects 2.1–2.4.
- Changing what BurnLog's `/ai-setup` or MoneyLog's
  `/moneylog/onboarding` ask or how they generate goals/plans —
  reused verbatim, only their `returnTo` handling changes (MoneyLog
  gains it; BurnLog already has it).
- Making age/weight/height/activityLevel optional on `Profile` —
  `/signup/profile` keeps collecting them for every signup, per
  explicit decision (avoids a signup-flow migration; those columns
  stay `NOT NULL`).
- Any shared cross-app goal/insight layer — that's sub-project 3.

## Design

### Signup flow

`app/signup/profile/page.tsx`'s `handleSave` success branch changes
one line:

```diff
-        router.push('/ai-setup');
+        router.push('/onboarding/apps');
```

Nothing else about signup changes — the profile row still gets
firstName/lastName/age/weight/height/activityLevel/username exactly
as today.

### App-selection screen

New route `app/onboarding/apps/page.tsx` (top-level, matching
`/ai-setup`'s and `/signup`'s existing top-level convention — this
flow spans multiple app themes, so it deliberately sits outside any
single app's route group). Renders a multi-select grid of the 6
sub-apps from `APPS` (excluding `logbook`, which is implicit and not
a choice — every user always has Logbook). Each card shows the app's
mark, name, and tagline (already defined in `APPS`), toggled on tap.
A "Continue" button is enabled once at least one app is selected (a
user must pick at least one sub-app; Logbook alone with nothing to do
is not a useful first session).

On submit:
1. Write the selected ids to `profiles.enabledApps` (replacing
   whatever was there — this screen only runs once, at signup).
2. Cache the same list into `localStorage` via
   `setEnabledApps()` (see Filtering below) so `AppSwitcher` reflects
   it immediately without waiting on a refetch.
3. `router.push(`/onboarding/sequence?apps=${selected.join(',')}&step=0`)`.

### Orchestrator

New route `app/onboarding/sequence/page.tsx`. A thin client component
with no real UI beyond a centered loading spinner (`Loader2`) — it
exists purely to redirect, never to be looked at.

Reads three URL params via `useSearchParams()`:
- `apps` — comma-separated ordered list of app ids to sequence through.
- `step` — current index into that list (defaults to `0`).
- `returnTo` — where to land once every app in the list has been
  processed (defaults to `/logbook`).

Logic on mount (and whenever these params change):

```ts
const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
  burnlog: '/ai-setup',
  moneylog: '/moneylog/onboarding',
};

const appList = apps.split(',').filter(Boolean) as AppId[];
if (step >= appList.length) {
  router.replace(returnTo);
  return;
}
const current = appList[step];
const onboardingRoute = ONBOARDING_ROUTES[current];
const nextSequenceUrl = `/onboarding/sequence?apps=${apps}&step=${step + 1}&returnTo=${encodeURIComponent(returnTo)}`;
if (onboardingRoute) {
  router.replace(`${onboardingRoute}?returnTo=${encodeURIComponent(nextSequenceUrl)}`);
} else {
  router.replace(nextSequenceUrl);
}
```

This is stateless — all progress lives in the URL, threaded through
each app's `returnTo` chain. No new "onboarding progress" DB field is
needed.

`AiSetupFlow` (`app/ai-setup/_components/AiSetupFlow.tsx`) already
reads `returnTo` from `searchParams` (defaulting to `/dashboard`) and
uses it at both the skip path (line 204) and the save-success path
(line 273) — no change needed there.

`MoneyLogOnboardingFlow` (`app/(moneylog)/moneylog/onboarding/_components/MoneyLogOnboardingFlow.tsx`)
currently hardcodes `router.replace('/moneylog')` in two places
(`handleSkipAll`, `handleConfirm`). Both become
`router.replace(returnTo)`, where `returnTo` is read from
`useSearchParams()` with a default of `/moneylog` (preserving today's
behavior when the flow is entered directly, e.g. from the "Reonboard"
button on `/moneylog/config`).

For symmetry, `/moneylog/config`'s `AppConfigShell` `onboardingHref`
changes from `/moneylog/onboarding` to
`/moneylog/onboarding?returnTo=/moneylog/config`, matching how
BurnLog's config page already does `/ai-setup?returnTo=/dashboard/config`.

### Schema + backfill

`prisma/schema.prisma`, on the `Profile` model, add:

```prisma
enabledApps String[] @default([])
```

Applied to the real Supabase Postgres database via `npx prisma db
push` (this repo has no `prisma/migrations` or `supabase/migrations`
directory — schema changes are applied directly against the DB
configured in `.env.local`'s `DATABASE_URL`; that file is gitignored,
so a git worktree needs it copied in before running Prisma commands).

One-time backfill, run once against the same database immediately
after the `db push`:

```sql
UPDATE profiles
SET "enabledApps" = ARRAY['moneylog','tasklog','homelog','sociallog','shoppinglog','burnlog']
WHERE "enabledApps" = '{}';
```

This preserves every existing user's current "see all apps" behavior
exactly — the `WHERE` guard makes it safe to re-run.

### Filtering + reuse for existing users

`lib/appMode.ts` gains a fourth namespaced-storage pair, following the
exact pattern already used for `defaultApp`/`activeApp`:

```ts
export const ENABLED_APPS_KEY = 'app:enabledApps';

export function getEnabledApps(): AppId[] | null {
  const val = safeGet(ENABLED_APPS_KEY);
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.filter(isAppId) : null;
  } catch {
    return null;
  }
}

export function setEnabledApps(apps: AppId[]): void {
  safeSet(ENABLED_APPS_KEY, JSON.stringify(apps));
}
```

`null` (cache empty/unparseable) is the "unknown yet" state, distinct
from `[]` (a real, if unlikely, "nothing enabled").

`components/TopBar.tsx` — its existing mount effect (which already
calls `getActiveApp()`) also fetches
`.from('profiles').select('enabledApps').single()` once and calls
`setEnabledApps(data.enabledApps)`. `TopBar` renders on every
authenticated page already, so this keeps the cache warm without a
dedicated fetch site.

`components/AppSwitcher.tsx` — where it currently does
`Object.values(APPS)`, it instead computes:

```ts
const enabled = getEnabledApps();
const visibleApps = enabled
  ? Object.values(APPS).filter((app) => app.id === 'logbook' || enabled.includes(app.id))
  : Object.values(APPS); // cache not warm yet — show everything rather than nothing
```

### "Add another app" for existing users

`app/profile/page.tsx`'s existing "App" card (default-app selector)
gains a second section below it, "Add another app": lists any
`APPS` entries not in the current `enabledApps` (fetched the same way
the page already fetches the rest of `profile`, plus this one extra
column). Tapping one:
1. Optimistically appends it to local `enabledApps` state and calls
   `setEnabledApps()` to update the cache.
2. Writes the updated array to `profiles.enabledApps` via Supabase.
3. Routes to `/onboarding/sequence?apps=<newApp>&step=0&returnTo=/profile`.

Section is omitted entirely (not shown empty) once every app is
already enabled.

### Files touched

New:
- `app/onboarding/apps/page.tsx`
- `app/onboarding/sequence/page.tsx`

Modified:
- `prisma/schema.prisma` — add `enabledApps` to `Profile`
- `app/signup/profile/page.tsx` — redirect target after save
- `app/ai-setup/_components/AiSetupFlow.tsx` — no functional change; confirmed `returnTo` already threads through both exit paths
- `app/(moneylog)/moneylog/onboarding/_components/MoneyLogOnboardingFlow.tsx` — read and use `returnTo`
- `app/(moneylog)/moneylog/config/page.tsx` — `onboardingHref` gains `?returnTo=/moneylog/config`
- `lib/appMode.ts` — add `getEnabledApps`/`setEnabledApps`/`ENABLED_APPS_KEY`; export the existing private `isAppId` helper (already used internally, needed by the orchestrator and app-selection screen to validate URL params and selections)
- `components/TopBar.tsx` — fetch and cache `enabledApps` on mount
- `components/AppSwitcher.tsx` — filter by cached `enabledApps`
- `app/profile/page.tsx` — add "Add another app" section to the existing App card

Database (applied directly, not via a committed migration file, per
this repo's existing convention):
- `ALTER TABLE profiles ADD COLUMN "enabledApps" text[] NOT NULL DEFAULT '{}'` (via `prisma db push`)
- Backfill `UPDATE` shown above

### Error handling / edge cases

- App-selection screen: "Continue" disabled with zero apps selected —
  no empty-`enabledApps` submission from this screen (only the
  pre-existing backfilled empty-turned-full state from old accounts,
  or a genuinely fresh row before backfill runs, can be `{}`).
- Orchestrator: an unknown/malformed `apps` value (e.g. missing,
  containing an invalid id) — invalid ids are filtered out via
  `isAppId`-style validation before use; if the filtered list is empty,
  redirect straight to `returnTo`.
- `TopBar`'s `enabledApps` fetch failing (network error, no profile
  row yet) — leaves the cache at `null`, so `AppSwitcher` falls back
  to showing all apps rather than hiding everything.
- MoneyLog's `returnTo` default (`/moneylog`) preserves the exact
  current behavior for anyone reaching `/moneylog/onboarding` without
  a `returnTo` (e.g. a stale bookmark).

### Testing

No automated test suite exists in this repo (confirmed during
sub-project 1) — `tsc --noEmit` and `next lint` are the available
verification, run after every task. Manual click-through: sign up as
a brand-new user, confirm landing on `/onboarding/apps`, select
BurnLog + MoneyLog + TaskLog, confirm it sequences through BurnLog's
AI setup, then MoneyLog's budget wizard, then lands on `/logbook`
(TaskLog silently marked enabled, no visible step). Open
`AppSwitcher` and confirm only Logbook/BurnLog/MoneyLog/TaskLog show.
Visit `/profile`, confirm "Add another app" lists the other 3, add
HomeLog, confirm it routes through `/onboarding/sequence` straight
back to `/profile` (no onboarding content yet) and `AppSwitcher` now
shows HomeLog too. Separately, confirm an existing pre-migration
account still sees all 7 apps after the backfill runs.
