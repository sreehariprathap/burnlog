# TravelLog

Travel-tracking sub-app. One of eight sub-apps under LogBook — see the
[root README](../../README.md) for how it fits into the wider app.

## What it does

- **Home** (`/travellog`) — visit stats (total visits, countries,
  explored stops).
- **Map** (`/travellog/map`) — Snapchat-Maps-style exploration map
  (Aceternity World Map, ported into `components/ui/world-map.tsx`)
  plus the "Log a visit" form. Visits are connected in chronological
  order; stays of a full day or more render as a pulsing hotspot.
- **Plan** (`/travellog/plan`) — placeholder for the IceMyVacation
  AI trip planner (separate spec).
- **Suggestions** (`/travellog/suggestions`) — placeholder for
  affordable-trip suggestions (separate spec).
- **Config** (`/travellog/config`) — TravelLog-specific settings. No
  dedicated onboarding flow yet.

## Routes

```
/travellog              Home
/travellog/map            Map + log a visit
/travellog/plan              Plan (placeholder)
/travellog/suggestions          Suggestions (placeholder)
/travellog/config                  Settings
```

## Data model

Prisma model: `TravelVisit` (table `travellog_visits`). Shares the
top-level `Profile` model with every other app. "Explored" (multi-day
stay) status is derived at read time via `isExplored()` in
`lib/travellog/types.ts`, never stored.

## Key files

```
app/(travellog)/
  layout.tsx                Route-group layout/theming
  travellog/page.tsx           Home
  travellog/map/                 Map + log-a-visit form
  travellog/plan/                   Plan (placeholder)
  travellog/suggestions/               Suggestions (placeholder)
  travellog/config/                       Settings
components/TravelLogBottomNav.tsx      TravelLog's bottom nav
components/TravelLogMark.tsx              TravelLog's app icon
components/ui/world-map.tsx                  Ported map component
lib/travellog/                                  TravelLog-specific helpers
```
