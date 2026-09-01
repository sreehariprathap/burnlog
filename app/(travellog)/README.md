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
- **Plan** (`/travellog/plan`) — AI-assisted trip planner (ported from
  IceMyVacation, using this codebase's OpenRouter infrastructure instead of
  DeepSeek). Fill in trip details, review a generated day-by-day itinerary,
  and accept to save the plan, auto-log it as a visit on the Map, and create
  TaskLog tasks (logistics + one per day).
- **Suggestions** (`/travellog/suggestions`) — AI-generated affordable-trip
  suggestions based on real free-time windows (TaskLog/LogBook),
  disposable income (MoneyLog), and upcoming public holidays in the
  user's configured country. "Plan this trip" deep-links into the Plan
  tab with the suggestion prefilled.
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

Prisma models: `TravelVisit` (table `travellog_visits`), `TravelPlan` (table
`travellog_plans`). `Task` (TaskLog's model) gets an optional `travelPlanId`
back-reference. Shares the top-level `Profile` model with every other app.
"Explored" (multi-day stay) status is derived at read time via
`isExplored()` in `lib/travellog/types.ts`, never stored.

`Profile.country` (nullable, set from TravelLog's config page) drives the
Suggestions tab's holiday lookup.

## Key files

```
app/(travellog)/
  layout.tsx                Route-group layout/theming
  travellog/page.tsx           Home
  travellog/map/                 Map + log-a-visit form
  travellog/plan/                   AI trip planner (intake → review → accept)
  travellog/suggestions/               Suggestions (free time + income + holidays → AI picks)
  travellog/config/                       Settings
components/TravelLogBottomNav.tsx      TravelLog's bottom nav
components/TravelLogMark.tsx              TravelLog's app icon
components/ui/world-map.tsx                  Ported map component
lib/country.ts                                  Country list for config
lib/travellog/itinerary.ts                      Itinerary types + prompt builder
lib/travellog/acceptPlan.ts                        Accept handler (save plan, log visit, create tasks)
lib/travellog/freeTime.ts                        Free-time window computation
lib/travellog/affordability.ts                Disposable-surplus signal
lib/travellog/holidays.ts                        Upcoming public holidays (date.nager.at)
lib/travellog/suggestions.ts                        Suggestion types + prompt builder
app/api/ai/travellog/                                 Itinerary generation, currency conversion, suggestions
lib/travellog/                                            TravelLog-specific helpers
```
