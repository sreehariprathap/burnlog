# IceMyVacation AI Trip Planner — Design Spec

## Goal

Port the AI-assisted itinerary generator from `~/Documents/Projects/IceMyVacation`
into TravelLog's Plan tab (`/travellog/plan`, currently a placeholder from the
TravelLog foundation spec). The user fills in trip details, an AI-generated
day-by-day itinerary is reviewed, and on accept: the plan is saved, matching
TaskLog tasks are created (book flights, book accommodation, pack, one task
per day of the itinerary), and a `TravelVisit` is auto-logged so the trip
immediately appears on the Map tab.

The source project uses DeepSeek directly; this port uses this codebase's
existing AI infrastructure (OpenRouter via `lib/ai/openrouter.ts`) instead —
no DeepSeek dependency, no new API key.

## Non-goals

- Google Maps route visualization (no Maps key configured in this project;
  the itinerary renders as day-by-day cards, not a map).
- A stored home-currency preference — the currency converter is a one-off
  picker on the review screen, not tied to MoneyLog.
- Editing an itinerary after generation (regenerate by resubmitting the
  form instead).
- The Suggestions tab (separate spec, still to come).

## Data model

Two additions to `prisma/schema.prisma`:

```prisma
model TravelPlan {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile        Profile   @relation(fields: [profileId], references: [id])
  profileId      String    @db.Uuid
  destination    String
  hotel          String?
  startDate      DateTime  @db.Date
  endDate        DateTime  @db.Date
  numPeople      Int       @default(1)
  transportMode  String    // 'car' | 'public_transit' | 'flight' | 'mixed'
  budget         Float?
  budgetCurrency String    @default("USD")
  itinerary      Json      // AI response, stored as-is — see "Itinerary JSON shape" below
  status         String    @default("draft") // 'draft' | 'accepted'
  acceptedAt     DateTime?
  createdAt      DateTime  @default(now())

  @@map("travellog_plans")
}
```

`Task` (in `prisma/schema.prisma`, table `tasklog_tasks`) gets one new
optional field, following the exact pattern of its existing `goalId`/`ideaId`
relations:

```prisma
  travelPlan   TravelPlan? @relation(fields: [travelPlanId], references: [id])
  travelPlanId String?     @db.Uuid
```

`Profile` gets the reciprocal `TravelPlan[]` relation, matching every other
per-profile model.

Both tables are created directly against the live Supabase project (this
codebase's established migration pattern — see
`docs/superpowers/plans/2026-08-31-tasklog-cost-moneylog.md`), with RLS
matching `travellog_visits`' owner-access policy. `tasklog_tasks` already has
RLS; adding a nullable column doesn't need a new policy.

### Itinerary JSON shape

Stored verbatim in `TravelPlan.itinerary`, and is exactly what the AI
returns (camelCased from the original DeepSeek/`itinerary.py` schema):

```ts
interface ItineraryDay {
  day: number;
  date: string; // 'YYYY-MM-DD'
  activities: Array<{
    time: string; // 'HH:MM'
    title: string;
    description: string;
    location: string;
    lat: number | null;
    lng: number | null;
    estimatedCost: number;
    transportNote: string;
  }>;
}

interface Itinerary {
  days: ItineraryDay[];
  budgetBreakdown: { accommodation: number; food: number; activities: number; transport: number };
  totalEstimatedCost: number;
  currency: string;
}
```

## AI generation endpoint

`app/api/ai/travellog/itinerary/route.ts` — follows the exact convention
used by every other AI route in this codebase (e.g.
`app/api/ai/tasklog/breakdown/route.ts`):

- `POST`, auth-gated via `createClient()` + `supabase.auth.getUser()`.
- Model comes from `getModel(supabase, 'text')` (`lib/ai/modelConfig.ts`) —
  same `OpenAI` client pointed at OpenRouter's base URL
  (`lib/ai/openrouter.ts`'s pattern, inlined the same way `breakdown/route.ts`
  does), **not** a DeepSeek client.
- Request body: `{ destination, hotel, startDate, endDate, numPeople,
  transportMode, budget, budgetCurrency }`.
- System + user prompt ported from `itinerary.py`'s `_build_system_prompt`
  and `_build_user_prompt` (including the four `TRANSPORT_HINTS` strings for
  car/public_transit/flight/mixed) — same day-count, per-day
  morning/afternoon/evening activity structure, same
  budget-breakdown-must-equal-total instruction — with the JSON schema in the
  prompt using the camelCase field names above instead of the original
  snake_case.
- `response_format: { type: 'json_object' }`, `temperature: 0.5` — matches
  `tasklog/breakdown/route.ts`, the nearest sibling route in shape (also a
  multi-item JSON generation task), rather than inventing a new value.
- On success: returns the parsed `Itinerary` JSON directly (no DB write yet
  — the plan isn't saved until the user accepts).
- Validation mirrors `breakdown/route.ts`'s style: check `days` is a
  non-empty array, each day has `activities`, `budgetBreakdown` has all four
  numeric keys, `totalEstimatedCost` is a number, `currency` is a string.
  Malformed responses return a 502 via `formatAiError`, matching every other
  AI route's error contract.

## Currency conversion endpoint

`app/api/ai/travellog/currency/route.ts` — direct, unauthenticated-is-fine
passthrough (mirrors the source project's `currency.py`, which needs no
auth either since it's just a public rate lookup):

- `GET /api/ai/travellog/currency?from=USD&to=THB`
- Fetches `https://api.frankfurter.app/latest?from={from}&to={to}` (free, no
  key, matches the source project's choice) and returns `{ rate: number }`.
- 400 if `from`/`to` are missing; 502 if the upstream call fails.

## UI: `/travellog/plan`

Replaces the current placeholder page. Three states, one page:

**1. Intake form** (`TripIntakeForm`, modeled on `IntakeForm.tsx` from the
source project but using this codebase's `Input`/`Select`/`Label`
components): destination (text), hotel (text, optional), start/end date,
number of people, transport mode (`Select`: Car / Public transit / Flight /
Mixed), budget (optional number) + budget currency (`Select`, defaults to
USD). Submits to the itinerary endpoint.

**2. Loading state**: a simple centered spinner + "Planning your trip…" —
this codebase has no equivalent of the source project's dedicated
`LoadingState.tsx` component elsewhere, so a plain `Loader2` (already used
throughout, e.g. `TaskDetailSheet`) is enough.

**3. Itinerary review** (`ItineraryReview`, replaces `ItineraryDisplay.tsx` +
`MapView.tsx` — no map per this spec's non-goals): one `Card` per day
listing its activities (time, title, description, location, estimated
cost), a budget breakdown card, a currency-conversion `Select` next to the
total (calls the currency endpoint on change, shows the converted total
inline — doesn't replace the original), and an **Accept trip plan** button.
A **Start over** link returns to the intake form.

## On accept

Single handler, called when the user confirms the reviewed itinerary:

1. Insert the `TravelPlan` row with `status: 'accepted'`,
   `acceptedAt: new Date().toISOString()`, and the full form state +
   itinerary JSON.
2. Insert a `TravelVisit` row (`travellog_visits`): `placeName: destination`,
   `country` left as the same free-text `destination` value split isn't
   attempted (no geocoding round-trip here — see "Country field" below),
   `lat`/`lng` from the itinerary's first activity with non-null
   coordinates (falls back to `0, 0` only if every activity lacks
   coordinates, which the generation prompt's "provide realistic lat/lng
   for every location" instruction makes rare), `arrivalDate: startDate`,
   `departureDate: endDate`, `notes: `Auto-logged from trip plan``.
3. Bulk-insert `tasklog_tasks`, all tagged `travelPlanId` and
   `category: 'life'`:
   - `priority: 'high'`, `dueDate: startDate`: "Book flights to
     {destination}" — only if `transportMode` is `'flight'` or `'mixed'`.
   - `priority: 'high'`, `dueDate: startDate`: "Book accommodation in
     {destination}" if `hotel` is empty, else "Confirm booking: {hotel}".
   - `priority: 'high'`, `dueDate: startDate`: "Pack for {destination}
     trip".
   - `priority: 'medium'`, `dueDate: day.date`, one per itinerary day:
     title `Day {day.number} in {destination}`, `notes` is the day's
     activities joined as `"{time} — {title}"` lines (so the task carries
     the day's plan without needing to open the `TravelPlan` record).
4. Toast confirming the count of tasks created, redirect to
   `/travellog/map` (so the newly-logged visit and hotspot are immediately
   visible) — matches the "confirm → see the result" pattern already used
   by `map/page.tsx`'s `LogVisitDrawer`.

### Country field

`TravelVisit.country` is required (`String`, not nullable). The intake form
only collects a free-text `destination` (e.g. "Kyoto, Japan" or just
"Paris"), not a separate country field, so there's nothing reliable to
geocode-split. Store `destination` in `country` verbatim (matching the
existing manual-entry fallback behavior in `LogVisitDrawer`, which does the
same when no country is supplied) — this is a pragmatic default, not a data
quality guarantee, and can be revisited if the Suggestions spec needs a
cleaner country value.

## Testing / verification

- `npx tsc --noEmit` and `npm run lint` clean — this repo has no test
  suite (same bar as every prior plan).
- Manual verification in the browser: submit the intake form for a real
  destination, confirm a day-by-day itinerary renders with realistic
  activities and lat/lng, confirm the budget breakdown sums to the total,
  toggle the currency converter and confirm it calls the live
  frankfurter.app rate, accept the plan, confirm: the `TravelPlan` row
  exists with `status = 'accepted'`, the expected TaskLog tasks exist
  (logistics + one per day) each with `travelPlanId` set, and the trip
  appears as a visit (with hotspot, since multi-day) on `/travellog/map`.
