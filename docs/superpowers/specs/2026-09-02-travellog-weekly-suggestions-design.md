# TravelLog Weekly Trip Suggestions — Design Spec

## Goal

Add a second, automated suggestions surface to TravelLog: once a week, an
AI job generates 5-8 trip ideas per user from their travel history and
upcoming free time/long weekends, persists them, and notifies the user.
They're shown on the existing `/travellog/suggestions` page as a new
"This week's picks" card stack, browsable via swipe/scroll/keys — never
individually dismissed. This is additive: the existing on-demand
"Refresh suggestions" flow (`docs/superpowers/specs/2026-09-01-travellog-suggestions-design.md`)
is untouched and keeps living on the same page.

## Non-goals

- **Replacing the on-demand suggestions flow** — both coexist.
- **Affordability signal** — unlike the on-demand suggestions, the weekly
  batch does not factor in `computeAverageMonthlySurplus`. It's driven
  purely by travel history + free time + holidays, per the approved scope.
- **Per-card dismiss/like/save** — cards are never removed from the stack
  by the user. The only opt-out is the config toggle, which stops future
  weekly batches for that profile entirely.
- **Destination photos** — the on-demand suggestions design already
  avoided fake pricing APIs for the same honesty reason; photos have the
  same problem (no licensed image API is wired into this project, and free
  hotlink-by-keyword services like the old Unsplash Source endpoint are
  deprecated/unreliable). Cards use a stylized gradient + place-pin
  treatment instead of a photo, matching the icon-driven visual language
  already used elsewhere (`components/ui/stat-card.tsx`, etc.).
- **Planning/itinerary generation inside the card stack** — tapping a card
  reuses the existing "Plan this trip" deep link into `/travellog/plan`
  (see below), not a new detail view.

## Data model

Two Prisma changes:

```prisma
// on Profile
weeklyTripSuggestionsEnabled Boolean @default(true)
```

```prisma
model TravelSuggestion {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId   String   @db.Uuid
  destination String
  country     String
  startDate   DateTime @db.Date
  endDate     DateTime @db.Date
  windowLabel String   // e.g. "Long weekend · Nov 14-16"
  reason      String   // one-sentence rationale from the AI
  weekOf      DateTime @db.Date // Monday of the batch's generation week
  createdAt   DateTime @default(now())

  @@index([profileId, weekOf])
  @@map("travellog_weekly_suggestions")
}
```

`weeklyTripSuggestionsEnabled` defaults to `true` (opt-out, not opt-in —
this is a passive weekly nudge, not something requiring setup, matching
how `Notification`-producing features in this codebase generally behave).
Each weekly cron run for a profile deletes that profile's existing
`travellog_weekly_suggestions` rows and inserts a fresh batch — no
`status` column needed since nothing is dismissed individually, and the
suggestions page only ever needs "the current batch."

## Config toggle

`app/(travellog)/travellog/config/page.tsx` gets a new row below the
existing country `Select`, using the existing `Switch` component
(`components/ui/switch.tsx`):

```tsx
<div className="flex items-center justify-between">
  <div>
    <Label htmlFor="weekly-suggestions" className="font-medium">Weekly trip suggestions</Label>
    <p className="text-xs text-muted-foreground">Get a new set of trip ideas every week based on your travel history and free time.</p>
  </div>
  <Switch
    id="weekly-suggestions"
    checked={profile?.weeklyTripSuggestionsEnabled ?? true}
    onCheckedChange={handleWeeklyToggle}
  />
</div>
```

`handleWeeklyToggle` mirrors `handleCountryChange`: updates
`profiles.weeklyTripSuggestionsEnabled` via the Supabase client, then
`refreshCurrentProfile()`.

## Weekly AI job

New `lib/travellog/weeklySuggestions.ts`, structurally parallel to the
existing `lib/travellog/suggestions.ts` but scoped to this feature's
inputs:

```ts
export interface WeeklySuggestionsRequest {
  visitedPlaces: string[];        // past TravelVisit.placeName + country, most recent first, capped at 20
  freeWindows: FreeWindowInput[]; // from lib/travellog/freeTime.ts, 90-day horizon
  holidays: HolidayInput[];       // from lib/travellog/holidays.ts, 90-day horizon
  country: string;
}

export interface WeeklyTripSuggestion {
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  windowLabel: string; // short human label, e.g. "Long weekend · Nov 14-16"
  reason: string;      // one sentence
}

export interface WeeklySuggestionsResponse {
  suggestions: WeeklyTripSuggestion[];
}

export function buildWeeklySuggestionsSystemPrompt(): string;
export function buildWeeklySuggestionsUserPrompt(req: WeeklySuggestionsRequest): string;
export function validateWeeklySuggestionsResponse(raw: unknown, freeWindows: FreeWindowInput[]): WeeklySuggestionsResponse;
```

Prompt asks for **5 to 8** destinations (vs. 3-5 for the on-demand
version, per the approved batch size), each constrained to a supplied
free window exactly like the existing prompt's date-validity rule, and
instructed to prefer destinations different from `visitedPlaces` (novelty)
while still allowing a repeat if a long weekend genuinely suits a
previously visited place. `windowLabel` is requested directly from the
AI (short, e.g. "Long weekend · Nov 14-16" or "3-day window") rather than
computed after the fact, since the AI already has the holiday context to
phrase it well; validation falls back to `"${startDate} – ${endDate}"` if
the field is missing or non-string. `validateWeeklySuggestionsResponse`
reuses the same "drop malformed entries, don't fail the whole batch"
tolerance as `validateSuggestionsResponse`, but requires the resulting
count to be between 1 and 8 (not empty) rather than exactly matching a
target.

`WEEKLY_HORIZON_DAYS = 90` (vs. 60 for on-demand) since a batch needs to
stay relevant across the week until the next run, not just at the moment
of a button click.

## Cron job

New `app/api/cron/travellog-weekly-suggestions/route.ts`, following
`app/api/cron/intel-suggest/route.ts`'s exact shape:

```ts
export async function GET(request: Request) {
  // 1. Authorization: Bearer ${CRON_SECRET} check, same as intel-suggest.
  // 2. createServiceRoleClient()
  // 3. const model = await getModel(supabase, 'travellog-weekly-suggestions');
  // 4. Load candidate profiles:
  //    select id, userId, country from profiles
  //      where weeklyTripSuggestionsEnabled = true and country is not null
  // 5. For each profile (try/catch per-profile, same non-fatal-on-error pattern as intel-suggest):
  //    a. Query travellog_visits (placeName, country, arrivalDate desc, limit 20) for that profileId.
  //    b. Query myday_blocks + tasklog_tasks over the next 90 days, run computeFreeWindows.
  //       If freeWindows.length === 0, skip (increment `skipped`, no AI call — nothing to anchor suggestions to).
  //    c. fetchUpcomingHolidays(profile.country, today, 90).
  //    d. runAiJob(supabase, profile.id, { jobType: 'travellog-weekly-suggestions', app: 'travellog', model }, input, callFn)
  //       where callFn hits OpenRouter with buildWeeklySuggestionsSystemPrompt/UserPrompt,
  //       response_format json_object, then validateWeeklySuggestionsResponse.
  //    e. supabase.from('travellog_weekly_suggestions').delete().eq('profileId', profile.id)
  //    f. Bulk insert the new suggestions with weekOf = the Monday of `today` (ISO date, midnight UTC).
  //    g. sendPushToUser(supabase, profile.userId, {
  //         title: 'New trip ideas for this week',
  //         message: `${suggestions.length} new places to consider for your next trip.`,
  //         url: '/travellog/suggestions',
  //       })
  // 6. Return { profilesProcessed, suggestionsWritten, skipped, errors } same shape as intel-suggest.
}
```

`vercel.json` gains:

```json
{ "path": "/api/cron/travellog-weekly-suggestions", "schedule": "0 8 * * 1" }
```

(Monday 08:00 UTC — after `intel-cohort`'s 02:30 slot, before user's
typical morning check-in; arbitrary but consistent with the existing
crons all running overnight/early morning.)

## UI: "This week's picks" card stack

New `components/travellog/WeeklyTripStack.tsx`, adapting the mechanics of
[smoothui's `ScrollableCardStack`](https://smoothui.dev/docs/components/scrollable-card-stack)
(already inspected in full — it's MIT-style shadcn-registry code meant to
be copied in, not an npm dependency): same index-based stacked-card
transform math, wheel/touch/keyboard navigation (clamped 0..length-1, no
looping, no removal — swiping just moves the current index, which is
exactly the "rotate, never dismiss" behavior asked for), and dot
indicators, built on the `motion` package already in this repo (see
`components/ui/background-paths.tsx` for the existing precedent of
importing from `motion/react`). The card face is replaced entirely:

```tsx
interface TripCardItem {
  id: string;
  destination: string;
  country: string;
  windowLabel: string;
  reason: string;
  startDate: string;
  endDate: string;
}
```

Each card: a colored gradient header (reusing the aurora palette
established for the logbook/travellog visual language) with a `MapPin`
icon (lucide-react) and the destination name large, then a body with the
`windowLabel` as a small badge and `reason` as body text. Tapping/clicking
the active card navigates to `/travellog/plan` with the same query params
`handlePlanTrip` already builds on the on-demand page — no new "plan this
trip" button needed, the whole card is the affordance, since there's no
per-card cost/currency to show a separate CTA next to.

## Wiring into `/travellog/suggestions`

At the top of `TravelLogSuggestionsPage`, a new effect (independent of
the existing on-demand-signals effect) fetches the current profile's
`travellog_weekly_suggestions` rows:

```ts
supabase
  .from('travellog_weekly_suggestions')
  .select('*')
  .eq('profileId', profile.id)
  .order('createdAt', { ascending: true });
```

If the result is non-empty, render:

```tsx
<div className="flex flex-col gap-2">
  <h2 className="text-sm font-semibold text-muted-foreground">This week's picks</h2>
  <WeeklyTripStack items={weeklySuggestions} />
</div>
```

above the existing on-demand section. If empty (feature freshly enabled
and the first Monday run hasn't happened yet, disabled, or the last run
had no free windows to suggest against), the section renders nothing —
no empty-state card, since this is a passive weekly feature with nothing
actionable to prompt in that state.

## Testing / verification

- `npx tsc --noEmit` and `npm run lint` clean.
- Manual: run the new cron route locally with the correct
  `Authorization: Bearer $CRON_SECRET` header against a seeded profile
  (country set, `weeklyTripSuggestionsEnabled` true, a `myday_blocks`
  gap in the next 90 days) and confirm `travellog_weekly_suggestions`
  rows are written, a `notifications` row appears, and a second run
  replaces rather than duplicates the batch. Toggle the config switch off,
  re-run the cron, confirm that profile is skipped. Load
  `/travellog/suggestions` and confirm the "This week's picks" stack
  renders, swiping/scrolling/arrow-keys moves through cards without any
  card disappearing, and tapping a card navigates to `/travellog/plan`
  prefilled with that suggestion's destination/dates.
