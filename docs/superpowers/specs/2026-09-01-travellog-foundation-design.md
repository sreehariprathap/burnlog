# TravelLog Foundation — Design Spec

## Goal

Add TravelLog as the eighth sub-app under LogBook: a place to log where a
user has travelled and see it visualized as a Snapchat-Maps-style
"exploration" map. This spec covers the foundation only — the app
scaffold, the visit data model, the map, and a log-a-visit form. Two
follow-on sub-projects build on top of this and get their own specs:

- **IceMyVacation AI planner** — ports the DeepSeek-based itinerary
  generator from `~/Documents/Projects/IceMyVacation`, lets the user
  review/accept a generated plan, and on accept creates TaskLog tasks
  (book flights, book rooms, pack, etc.). Needs `TravelVisit` (or a
  sibling `TravelPlan` model) to exist first.
- **Travel suggestions tab** — recommends affordable trips using
  TaskLog free time, MoneyLog income/balance, user location, and
  upcoming holidays. Most open-ended; needs a holidays data source that
  doesn't exist yet.

Both show as nav tabs in this foundation (Plan, Suggestions) but render
a placeholder until their own specs land.

## Non-goals (this spec)

- AI itinerary generation, trip planning, or task creation on accept.
- Holiday lookups, income/balance-based suggestions.
- Social/sharing of the explored map with other users.

## App scaffolding

Follows the existing 7-app pattern in this repo exactly (see
`app/(tasklog)/README.md` for the reference shape):

- New route group `app/(travellog)/travellog/` with a client
  `layout.tsx` that sets the `app-travellog` theme class on
  `<html>` and calls `setActiveApp('travellog')` (mirrors every other
  app's layout, e.g. `app/(tasklog)/layout.tsx`).
- `lib/appMode.ts`: add `'travellog'` to the `AppId` union, `isAppId`,
  and a `travellog` entry in `APPS` (`home: '/travellog'`, a
  `themeClass: 'app-travellog'`, name "TravelLog", tagline "Track
  everywhere you've been").
- `app/globals.css`: add an `.app-travellog` theme block, following
  the pattern of the other `.app-*` blocks already there (color tokens
  only — no new design system).
- New `components/TravelLogBottomNav.tsx`, modeled on
  `TaskLogBottomNav.tsx`: **Home** (`/travellog`), **Map**
  (`/travellog/map`), **Plan** (`/travellog/plan`), **Suggestions**
  (`/travellog/suggestions`), **Config** (`/travellog/config`).
- `app/(travellog)/README.md` documenting routes/data model, matching
  every other app's README.
- Root `README.md`: add TravelLog to the apps table and the directory
  tree.
- Onboarding: none for this spec (matches TaskLog's current state —
  no dedicated flow yet, "Reonboard" stays hidden until one exists).

## Data model

One new Prisma model:

```prisma
model TravelVisit {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile       Profile   @relation(fields: [profileId], references: [id])
  profileId     String    @db.Uuid
  placeName     String
  country       String
  lat           Float
  lng           Float
  arrivalDate   DateTime  @db.Date
  departureDate DateTime? @db.Date  // null = single-day visit
  notes         String?
  createdAt     DateTime  @default(now())

  @@map("travellog_visits")
}
```

- Add the reciprocal `TravelVisit[]` relation on `Profile`.
- "Explored" (hotspot) status is derived, never stored:
  `departureDate != null && departureDate >= arrivalDate + 1 day`.
- The migration is applied directly against the live Supabase project
  (matching this codebase's established pattern — see the cost-tagged
  TaskLog spec) — `prisma/schema.prisma` is source-of-truth
  documentation, not the mechanism that creates the table.
- `TravelVisit` insert/select goes through the Supabase JS client
  (`@supabase/ssr`), same as every other app — no new data-access
  pattern.

## Map visualization

Port `components/ui/world-map.tsx` from Aceternity UI
(`https://ui.aceternity.com/components/world-map`) via its registry
JSON, with two adaptations:

1. **Theme**: the upstream component reads `next-themes`; this repo
   has its own `useTheme` from `components/ThemeProvider.tsx` with the
   same `'light' | 'dark' | 'system'` shape — swap the import, resolve
   `'system'` the same way `ThemeProvider` already does.
2. **Hotspots**: extend the component's props with an optional
   `hotspots?: { lat: number; lng: number; label?: string }[]` that
   renders a larger, pulsing marker at each point, reusing the
   component's existing lat/lng → SVG projection function (it already
   projects `dots` internally; hotspots reuse that, not a new
   projection).

New dependency: `dotted-map` (the component's map-tile source).
`motion` is already installed (`^13.1.1`).

**Data → props mapping**, computed on `/travellog/map`:

- Fetch the profile's `TravelVisit` rows, sorted by `arrivalDate`.
- Build `dots` as sequential connections: visit 1 → visit 2 → visit 2
  → visit 3 → ... (each visit after the first is both an `end` of the
  previous pair and a `start` of the next), so the map draws one
  continuous path in chronological order. A single visit renders as
  one dot with no line (no pair to connect).
- Build `hotspots` from every visit where the derived "explored"
  condition is true.

## Log-a-visit UI

A form (Drawer or Sheet, matching `TaskDetailSheet`'s pattern) reachable
from `/travellog/map`:

- **Place name** (text), **Country** (text).
- **Coordinates**: no Google/Places API key exists in this project
  today (IceMyVacation's key is project-local, not shared). Use
  OpenStreetMap's Nominatim (`nominatim.openstreetmap.org`, free, no
  key) for a debounced place-name → lat/lng lookup, with manual lat/lng
  fields as a fallback if the lookup returns nothing. This keeps the
  MVP dependency-free; swapping in Google Places later (when the AI
  planner sub-project wires up a Maps key) is a drop-in replacement
  behind the same lookup function.
- **Arrival date**, **Departure date** (optional — omitting it means a
  single-day visit).
- **Notes** (optional, free text). Photo attachment is out of scope for
  this spec (no existing file-upload pattern in this codebase to reuse
  yet — revisit if requested).
- On save: insert into `travellog_visits`, close the form, refetch the
  map's visit list (SWR revalidate, matching the rest of the codebase's
  data-fetching pattern).

## Home tab (`/travellog`)

Simple stats card, matching other apps' Home tab weight:

- Total visits, distinct countries, total "explored" (multi-day) stops.
- A "Log a visit" entry point (opens the same form as the Map tab).

## Testing / verification

- `npx tsc --noEmit` and `npm run lint` clean (this repo has no test
  suite — matches the verification bar used for the TaskLog
  cost-tagged-tasks work).
- Manual verification in the browser: log a single-day visit (appears
  as a plain dot, no hotspot), log a multi-day visit (appears as a
  hotspot), log a third visit and confirm the path connects all three
  in date order regardless of the order they were logged in.
