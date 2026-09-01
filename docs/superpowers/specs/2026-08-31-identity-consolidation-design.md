# Identity Consolidation — Design Spec

Sub-project 1 of 3 in the "Logbook as platform hub" initiative. Full
initiative: (1) identity consolidation [this spec], (2) app-selection +
AI-assisted onboarding from Logbook, (3) shared cross-app feature layer
(goals/streaks/insights spanning health, finance, tasks, social,
shopping). Sub-projects 2 and 3 are out of scope here and will get
their own specs.

## Problem

`app/profile/page.tsx` is a single monolithic page shared by all 7
apps (Logbook + 6 sub-apps). It branches on `activeApp` to show
app-specific settings (BurnLog health metrics/XP/water/meal-prep,
SocialLog settings) inline. Every sub-app's bottom nav has its own
`XxxProfileMenu` component, all pointing at the same `/profile` route.
There is no per-app "config" concept — identity (who the user is) and
app configuration (how this app behaves for them) are tangled
together in one page and one component tree.

## Goal

- Profile (identity: name, avatar, username, email, default app,
  logout, global admin tools) exists only in Logbook.
- Every sub-app's nav gets a **Config** tab (gear icon) instead of
  Profile, opening that app's own config page.
- Each app's config page hosts that app's bespoke settings (moved out
  of the old profile page), plus two shared actions: **Reonboard**
  (re-run that app's onboarding, when one exists) and **Export config
  as JSON** (download current settings).

## Non-goals (deferred to sub-project 2)

- Building onboarding flows for TaskLog/HomeLog/ShoppingLog (only
  BurnLog, via `/ai-setup`, and MoneyLog, via `/moneylog/onboarding`,
  have one today).
- Any schema/migration work — this slice is frontend restructuring
  only, reusing existing `profiles` table columns and existing
  per-app API routes as-is.
- App-selection UI in Logbook.

## Design

### Routing

`/profile` keeps its current URL (no route rename — avoids breaking
existing deep links/bookmarks for no benefit). Only
`components/LogbookBottomNav.tsx` continues linking its Profile tab to
`/profile`.

New per-app config routes, one per sub-app, following each app's
existing route-group convention:

| App | Config route |
|---|---|
| BurnLog | `/dashboard/config` |
| MoneyLog | `/moneylog/config` |
| TaskLog | `/tasklog/config` |
| HomeLog | `/homelog/config` |
| SocialLog | `/sociallog/config` |
| ShoppingLog | `/shoppinglog/config` |

### Content split

**`/profile` (identity-only, Logbook-scoped):**
- Avatar, name, username (existing `ProfileAvatar` + username editor —
  unchanged, kept here since username is cross-app identity, used by
  SocialLog to find you).
- Email (read-only, from session).
- "App" card — default-app selector (existing `APPS`/`setDefaultApp`
  logic — unchanged, this is genuinely cross-app, stays in Logbook).
- Logout.
- Admin-only (`profile.isAdmin`): Test Push Notifications, Onboarding
  Page Toggles (`OnboardingPageTogglesModal`), AI Model Settings
  (`AiModelSettingsModal`) — these are global/account-level, not
  burnlog data, so they move here rather than to BurnLog config.

Everything currently gated `activeApp === 'burnlog'` in
`app/profile/page.tsx` — Health Metrics (BMI/BMR), Level/XP/streak
card, AI Insights enable/disable, Water Tracking, Meal Planner — moves
into the new BurnLog config page unchanged in behavior.

`SocialLogSettingsCard` moves from `app/profile/_components/` to the
new SocialLog config page's component directory; its existing
`/api/sociallog/profile-settings` usage is unchanged.

MoneyLog/TaskLog/HomeLog/ShoppingLog config pages: shell only (title +
`AppConfigShell` actions below), no bespoke settings yet — there are
none to move. Sub-project 2's onboarding work will add settings here
over time.

### Shared components

**`ConfigMenu`** (`components/ConfigMenu.tsx`) replaces 5 of the 6
existing `XxxProfileMenu` components:
`MoneyLogProfileMenu`/`TaskLogProfileMenu`/`HomeLogProfileMenu`/
`SocialLogProfileMenu`/`ShoppingLogProfileMenu`. `ProfileMenu` itself
is **shared** by both `BottomNav.tsx` (BurnLog's nav) and
`LogbookBottomNav.tsx` today — it stays as-is for Logbook, but
BurnLog's `BottomNav.tsx` switches from `<ProfileMenu>` to
`<ConfigMenu>` since BurnLog is a sub-app and must get Config, not
Profile. `ConfigMenu` takes `href` (the app's config route) and
`isActive`, renders a gear icon + "Config" label styled per each app's
existing nav visual language (reuse whatever icon/label pattern the
deleted `XxxProfileMenu` used, just swap icon to `Settings` from
lucide-react and label to "Config").

Each sub-app's bottom-nav component (`BottomNav.tsx` for BurnLog,
`MoneyLogBottomNav.tsx`, `TaskLogBottomNav.tsx`,
`HomeLogBottomNav.tsx`, `SocialLogBottomNav.tsx`,
`ShoppingLogBottomNav.tsx`) swaps its profile-menu usage for
`<ConfigMenu href="..." isActive={...} />` (route per the table
above), and drops the now-unused profile-menu import.
`LogbookBottomNav.tsx` is unchanged.

**`AppConfigShell`** (`components/AppConfigShell.tsx`) — wraps each
app's config page content. Props: `appName`, `onboardingHref?`
(optional — BurnLog passes `/ai-setup?returnTo=/dashboard/config`,
MoneyLog passes `/moneylog/onboarding`, the rest omit it today),
`exportData: () => Record<string, unknown>` (returns the current
settings object to serialize). Renders:
- Page header with `TopBar`.
- The app's bespoke settings (children).
- "Reonboard" button — only rendered when `onboardingHref` is passed.
- "Export config as JSON" button — calls `exportData()`, serializes
  via `JSON.stringify(data, null, 2)`, creates a `Blob`, triggers
  download via a temporary `<a>` with an object URL (revoked after
  click) named `{app}-config.json`. No backend involvement — each
  config page already holds its settings in component state; export
  reads from that state.
- The app's own `XxxBottomNav`.

### Files touched

New:
- `components/ConfigMenu.tsx`
- `components/AppConfigShell.tsx`
- `app/(burnlog)/dashboard/config/page.tsx` (+ moved settings JSX/handlers from `app/profile/page.tsx`)
- `app/(moneylog)/moneylog/config/page.tsx`
- `app/(tasklog)/tasklog/config/page.tsx`
- `app/(homelog)/homelog/config/page.tsx`
- `app/(sociallog)/sociallog/config/page.tsx` (+ moved `SocialLogSettingsCard`)
- `app/(shoppinglog)/shoppinglog/config/page.tsx`

Modified:
- `app/profile/page.tsx` — strip to identity-only content
- `components/BottomNav.tsx` (BurnLog), `MoneyLogBottomNav.tsx`, `TaskLogBottomNav.tsx`, `HomeLogBottomNav.tsx`, `SocialLogBottomNav.tsx`, `ShoppingLogBottomNav.tsx` — swap profile-menu usage for `ConfigMenu`

Deleted:
- `components/MoneyLogProfileMenu.tsx`, `TaskLogProfileMenu.tsx`, `HomeLogProfileMenu.tsx`, `SocialLogProfileMenu.tsx`, `ShoppingLogProfileMenu.tsx`
- `app/profile/_components/SocialLogSettingsCard.tsx` (moved, not deleted-and-lost)

Unchanged:
- `components/ProfileMenu.tsx`, `components/LogbookBottomNav.tsx`
- All existing API routes (`/api/sociallog/profile-settings`, etc.)
- `prisma/schema.prisma` — no migration in this slice

### Error handling / edge cases

- User with no bespoke settings in a given app (MoneyLog/TaskLog/
  HomeLog/ShoppingLog config shells) still gets a working Export
  (exports `{}` or minimal placeholder) and no Reonboard button
  (hidden, not disabled — nothing to reonboard into yet).
- `AppConfigShell` export button disabled while `exportData()` would
  read from a still-loading state (same loading-guard pattern already
  used in `app/profile/page.tsx`).

### Testing

Manual click-through per app (no existing automated test coverage for
this page to extend): for each of the 6 sub-apps, confirm nav Config
tab opens the right route, settings that used to show under
`/profile` now show under `/config` with identical behavior
(read/write still hits the same API/Supabase calls), Export downloads
a valid JSON file, and BurnLog's Reonboard button still lands on
`/ai-setup`. Confirm `/profile` still loads for Logbook and no longer
shows any app-specific cards.
