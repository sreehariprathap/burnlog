# LogBook

LogBook is the **entry point** of the app — every user lands on `/logbook`
after login/signup (see `middleware.ts`), and it acts as a hub that
summarizes activity across all the other sub-apps. It's not a data-entry app
in its own right so much as a cross-app dashboard plus its own light
planning tools. See the [root README](../../README.md) for how it relates
to the other six sub-apps.

## What it does

- **Today digest** (`/logbook`) — a per-day score ring, streak badge, a
  "morning brief," an activity timeline, and a grid of summary cards, one
  per sub-app the user has enabled (fetched via `/api/logbook/today`).
- **Morning** (`/logbook/morning`) — the morning-brief flow in full.
- **My Day** (`/logbook/myday`) — a lightweight day planner (time-blocked
  tasks), independent of TaskLog's kanban board.
- **Quick add** — a floating action button for fast cross-app logging
  without switching apps.
- **Profile** (`/profile`, outside this route group but LogBook-scoped) —
  identity: avatar, name, username, email, default-app picker, logout, and
  (admin-only) global tools like push-notification testing and AI model
  settings. This is the *only* place profile/identity lives; every sub-app
  gets a **Config** page instead (see the identity-consolidation spec in
  `docs/superpowers/specs/`).

## Routes

```
/logbook           Today digest (home)
/logbook/morning     Morning brief
/logbook/myday        My Day planner
/profile               Identity (shared, not app-scoped)
```

## Data model

LogBook doesn't own a dedicated set of Prisma models the way other sub-apps
do — it reads/aggregates across other apps' data (via `lib/logbook/today.ts`
and `lib/crossApp/`) plus its own `MydayBlock` and `Idea` models for the My
Day planner and idea log.

## Key files

```
app/(logbook)/
  layout.tsx                Route-group layout/theming
  logbook/page.tsx            Today digest
  logbook/morning/              Morning brief
  logbook/myday/                  My Day planner
  logbook/_components/              StreakCalendar, WeeklySummary, QuickAddFab
components/LogbookBottomNav.tsx     LogBook's bottom nav
components/logbook/                 DayScoreRing, LogCardsGrid, StreakBadge, MorningBrief, ActivityTimeline, CorrelationInsight
lib/logbook/                        Cross-app aggregation for the "today" digest
lib/crossApp/                       Shared cross-app data helpers
```
