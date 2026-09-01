# TravelLog Suggestions — Design Spec

## Goal

Build the `/travellog/suggestions` tab (currently a placeholder from the
TravelLog foundation spec): AI-generated affordable-trip suggestions based
on the user's actual free time (TaskLog/LogBook), disposable income
(MoneyLog), and upcoming public holidays in their country. Tapping a
suggestion prefills the existing AI trip planner (`/travellog/plan`) so the
user can generate a full itinerary from it.

## Non-goals

- Real flight/hotel pricing — no such API is wired into this project;
  suggested costs come from the AI's estimate, same honesty level as the
  itinerary generator's per-activity cost estimates.
- Persisting suggestions — regenerated on demand (a "Refresh suggestions"
  action), not cached or stored, matching the Plan tab's itinerary being
  ephemeral until the user accepts it.
- Multi-country holiday awareness (e.g. holidays at the destination, not
  just the user's home country) — home-country holidays only, since that's
  what signals "you likely have time off."

## Data model

One new nullable column on `Profile`:

```prisma
country String?  // ISO 3166-1 alpha-2, e.g. "US" — null until set in TravelLog config
```

No default value — a null country means the Suggestions tab shows a
"set your country" prompt instead of attempting to run. This mirrors the
existing `currency` field: both are shared identity-level data stored on
`Profile`, but edited from an app-specific config page rather than a
central identity page (`currency` from MoneyLog's config;
`country` from TravelLog's, for the same reason — it's the app that
actually needs the field).

## Country config

`lib/country.ts` — a curated list of common countries, structurally
identical to the existing `lib/currency.ts` (`CURRENCIES` → `COUNTRIES`,
`isCurrencyCode` → `isCountryCode`, no `DEFAULT_CURRENCY` equivalent since
there's no sensible default country).

TravelLog's config page (`/travellog/config`, currently "No
TravelLog-specific settings yet.") gets a country `Select`, wired exactly
like MoneyLog config's currency `Select`: update `profiles.country` via the
Supabase client, then `refreshCurrentProfile()`.

## Signal 1: Free time

`lib/travellog/freeTime.ts`:

```ts
interface FreeWindow {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  dayCount: number;
}

function computeFreeWindows(
  blocks: { date: string }[],       // MydayBlock rows, next 60 days
  tasks: { dueDate: string | null; completedAt: string | null }[], // Task rows, next 60 days
  fromDate: Date,
  horizonDays: number = 60
): FreeWindow[]
```

A day is "busy" if it has any `myday_blocks` row on that date, or any
`tasklog_tasks` row with `dueDate` on that date and `completedAt` still
null. Walk the next `horizonDays` days from `fromDate`; consecutive free
days form a window; windows with `dayCount < 2` are discarded (a single
free day isn't a trip).

The Suggestions page queries `myday_blocks` and `tasklog_tasks` for the
next 60 days client-side (same `@supabase/ssr` browser-client pattern as
every other data fetch in this codebase) and passes the rows into this
function.

## Signal 2: Affordability

`lib/travellog/affordability.ts`:

```ts
async function computeAverageMonthlySurplus(
  supabase: SupabaseClient,
  profileId: string
): Promise<number> // average (income - expense) per month, last 3 months
```

Reuses the existing `expandRecurringInRange` from `lib/financePeriods.ts`
(already powers MoneyLog's own period views) against `recurring_items` +
`finance_transactions` for the last 3 calendar months, sums income minus
expense per month, and averages. No new finance logic — this is a thin
wrapper composing what MoneyLog already has.

## Signal 3: Holidays

`lib/travellog/holidays.ts`:

```ts
interface Holiday {
  date: string; // 'YYYY-MM-DD'
  name: string;
}

async function fetchUpcomingHolidays(
  countryCode: string,
  fromDate: Date,
  horizonDays: number = 60
): Promise<Holiday[]>
```

Direct browser `fetch` to `https://date.nager.at/api/v3/publicholidays/{year}/{countryCode}`
(free, no API key, CORS-open — verified via a live request). If the
60-day window crosses a calendar year boundary, fetch both years and
merge. Filters results to the `[fromDate, fromDate + horizonDays]` range.
This follows the same "call a free public API directly from client code"
precedent `lib/travellog/geocode.ts` already established with Nominatim in
the foundation spec — no server proxy needed.

## AI suggestion endpoint

`app/api/ai/travellog/suggestions/route.ts` — same convention as every
other AI route in this codebase (OpenRouter client, `getModel(supabase,
'text')`, `formatAiError`, JSON `response_format`):

- `POST`, auth-gated.
- Request body: `{ freeWindows: FreeWindow[], averageMonthlySurplus:
  number, currency: string, country: string, holidays: Holiday[] }` — all
  computed client-side and passed in, matching the itinerary route's
  "client computes/collects, server calls the model" division of labor.
- Prompt: gives the AI the free windows, surplus, and holidays, asks for 3
  to 5 destination suggestions, each constrained to fit *within* one of the
  supplied free windows (start/end dates must be a subset of a given
  window) and each with an estimated total cost that should not
  substantially exceed the average monthly surplus, plus a one-sentence
  rationale referencing the specific window/holiday/budget reasoning.
- Response shape:
  ```ts
  interface TripSuggestion {
    destination: string;
    startDate: string;
    endDate: string;
    estimatedCost: number;
    currency: string;
    rationale: string;
  }
  interface SuggestionsResponse { suggestions: TripSuggestion[] }
  ```
- Validation mirrors the itinerary route: checks `suggestions` is a
  non-empty array, each entry has the required string/number fields, dates
  parse and fall within a supplied free window. Malformed responses return
  502 via `formatAiError`.

## UI: `/travellog/suggestions`

Replaces the current placeholder. States:

1. **No country set** — prompt card: "Set your country to get trip
   suggestions," linking to `/travellog/config`.
2. **Country set, computing signals** — brief loading state while the free
   windows/surplus/holidays are computed and fetched (all client-side,
   should be fast — no AI call yet at this point).
3. **No free windows in the next 60 days** — empty state: "No free
   stretches found in the next 60 days — suggestions need at least a
   couple of open days." No AI call is made (nothing useful to suggest
   against).
4. **Ready** — a "Refresh suggestions" button (mirrors the Plan tab's
   "Generate itinerary" button pattern) that POSTs the three computed
   signals to the AI endpoint and renders the results as cards: 3-5
   `Card`s, each showing destination, date range, estimated cost, and the
   rationale. Each card has a "Plan this trip" button.
5. **Loading (AI call in flight)** — `Loader2` spinner on the button,
   matching every other AI-triggering button in this codebase.

## Deep-link into the Plan tab

"Plan this trip" navigates to:

```
/travellog/plan?destination={destination}&startDate={startDate}&endDate={endDate}&budget={estimatedCost}&budgetCurrency={currency}
```

The existing `TripIntakeForm` (`app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx`)
gets a new optional `initial?: Partial<ItineraryRequest>` prop that seeds
its `useState` initializers instead of empty strings. The Plan page reads
`useSearchParams()` and constructs this `initial` object, passing it
through. Transport mode is left at the form's existing default
(`public_transit`) since suggestions don't have enough signal to guess a
transport mode — the user picks it before generating the full itinerary,
same as any other manually-started plan.

## Testing / verification

- `npx tsc --noEmit` and `npm run lint` clean — no test suite in this
  repo, same bar as every prior plan.
- Manual verification: set a country in TravelLog config, confirm the
  Suggestions tab moves past the "set country" prompt. With no free
  MydayBlock/Task gaps, confirm the empty state shows and no network call
  to the AI endpoint fires. Clear a few days, confirm free windows are
  detected and suggestions generate, referencing a plausible real holiday
  for the configured country if one falls in the next 60 days. Tap "Plan
  this trip" and confirm the Plan tab's intake form is prefilled with the
  suggestion's destination/dates/budget.
