# AI-assisted habit creation from Logbook

Date: 2026-09-08
Status: approved, pending implementation plan

## Problem

Logbook's per-app FABs (`QuickLogFab` etc.) only create app-specific
entries (calories, workout, steps, chores, ...). There is no way to
create a recurring or one-off **habit** that:

- is captured as a short freeform sentence rather than a structured
  form,
- gets automatically routed to the right app (Burnlog, Travellog,
  Tasklog, Homelog, or any other app in the roster) based on what it
  says,
- supports flexible recurrence (daily, specific weekdays like
  "Mon-Fri", every-N-weeks, with an end date or occurrence count), and
- shows up in the unified My Day view with a checkbox, colored by
  whichever app it was routed to.

No such cross-app "create anything from one sentence" flow, AI intent
router into an app namespace, or general-purpose recurrence model
exists today. The closest precedent is `HouseholdChore` /
`HouseholdChoreInstance` (`prisma/schema.prisma`, ~line 1185), which
only supports single-day-of-week/monthly/yearly recurrence and is
homelog-specific.

## Non-goals

- No real speech-to-text this round. The Siri orb is decorative,
  animating during the AI call the same way it already does in
  `AskAiInput.tsx`. The user types the habit description. Real STT
  (Web Speech API or Whisper) is a fast-follow, not part of this spec.
- Not building a general RRULE engine. Recurrence is limited to the
  patterns in this spec (once / daily / weekly with a day-of-week set
  and an interval / end condition) via explicit columns, not an
  RRULE string — see design discussion in brainstorming, Approach A
  chosen over an `rrule`-library approach.
- Not migrating `HouseholdChore`. It keeps serving homelog chores as-is;
  `Habit` is a separate, app-agnostic model that happens to reuse the
  same occurrence-materialization pattern.
- Not adding habit streaks, stats, or gamification in this pass — just
  create, recur, complete.

## Design

### 1. Data model

```prisma
enum HabitRecurrenceType {
  once
  daily
  weekly
}

enum HabitEndType {
  never
  on_date
  after_n
}

model Habit {
  id             String              @id @default(cuid())
  userId         String
  title          String
  sourceApp      String?             // AppId, e.g. "burnlog" | "travellog" | "tasklog" | "homelog" | ... ; null = generic/unassigned
  recurrenceType HabitRecurrenceType
  daysOfWeek     Int[]               // 0=Sun..6=Sat; used when recurrenceType = weekly
  intervalWeeks  Int                 @default(1) // "every N weeks"
  endType        HabitEndType        @default(never)
  endDate        DateTime?
  endCount       Int?
  startDate      DateTime
  createdAt      DateTime            @default(now())
  occurrences    HabitOccurrence[]

  @@index([userId])
}

model HabitOccurrence {
  id          String   @id @default(cuid())
  habitId     String
  habit       Habit    @relation(fields: [habitId], references: [id], onDelete: Cascade)
  date        DateTime // due date, normalized to local midnight
  completed   Boolean  @default(false)
  completedAt DateTime?

  @@unique([habitId, date])
  @@index([date])
}
```

`sourceApp` is a plain string validated against the existing `AppId`
union (`lib/appMode.ts`) rather than a Prisma enum, so adding a new app
later doesn't require a migration.

Occurrence materialization follows `lib/homelog/choreRecurrence.ts`:
a `lib/habits/habitRecurrence.ts::materializeOccurrences(habit, throughDate)`
function expands `daysOfWeek` / `intervalWeeks` / `endType` into
`HabitOccurrence` rows for a rolling 60-day window. It runs:
- once, right after a `Habit` is created (covers the near term
  immediately), and
- lazily from the My Day API route when a requested date range has no
  materialized occurrences for an active habit whose window has
  expired (self-healing if a cron is ever added and misses a run — no
  cron is being added in this pass, since My Day is the only current
  consumer and lazy materialization is sufficient at current scale).

### 2. Entry point

A new "Habit" item is added to the FAB in
`app/(logbook)/logbook/myday/_components/MyDayClient.tsx` (or its FAB,
if factored out separately) — the unified My Day/Logbook surface,
since habit creation is inherently cross-app. Per-app FABs
(`QuickLogFab` etc.) are untouched.

### 3. Creation flow (3 screens, one modal)

**Screen 1 — Capture.** Reuses the `AskAiInput` visual pattern: a text
box plus the decorative `SiriOrb`/`AiCore` (idle → thinking → done/error
states already built). User types e.g. "drink 2L of water every day"
or "pack for the Goa trip next Friday." Submitting calls the new intent
route (below); the orb animates during the call.

**Screen 2 — Confirm intent.** Shows the AI's result as an editable
summary:
- Title (editable text)
- Detected app as a colored chip with icon (tap opens a picker over the
  full `AppId` roster, plus "General" for the null/unassigned case)
- One-time vs. recurring toggle (AI pre-fills a guess; user can flip it)

**Screen 3 — Recurrence (only if recurring).** Weekday multi-select
(supports "every day" as all-7 preselected, or "Mon-Fri" as a one-tap
preset plus manual toggles), "every N weeks" stepper, end condition
radio (never / on a date / after N occurrences) with the matching input.
"Create" persists the `Habit`, triggers immediate materialization, and
closes the modal.

Screens 2 and 3 are both reachable from Screen 1's result — a
misclassification or wrong recurrence guess never blocks creation, it's
just a couple of taps to fix.

### 4. AI intent route

New `app/api/ai/classify-habit/route.ts`, following the existing
`categorize-task` route's structure exactly:

1. Supabase auth check.
2. `getModel()` (`lib/ai/modelConfig.ts`) to resolve the configured model.
3. `runAiJob()` (`lib/ai/jobs.ts`) for job tracking/dedupe.
4. `chat.completions.create` with `response_format: json_object`. Prompt
   includes the full current `AppId` roster (name + one-line purpose
   each, e.g. "burnlog: fitness/nutrition/health", "travellog: trips
   and travel planning") and the user's raw text.
5. Expected JSON shape:
   ```ts
   {
     title: string;
     sourceApp: AppId | null;       // null when no app fits confidently
     isRecurring: boolean;
     suggestedRecurrence?: {
       daysOfWeek?: number[];
       intervalWeeks?: number;
     };
   }
   ```
6. Response is validated (e.g. zod) against this shape and against the
   live `AppId` roster before being returned; an invalid/unparseable
   response is treated as a classification failure (see Error handling).

### 5. My Day integration

`lib/myday/types.ts`'s `MyDaySource` union gains `'habitlog'`. The My
Day API route queries `HabitOccurrence` rows due within the requested
date range (materializing on demand per section 1) and maps them into
the existing `MyDayUnscheduledItem` shape, with `source: 'habitlog'`
and `sourceApp` carried through for coloring.

`DayTimeline`/`UnscheduledTray` render habit occurrences like any other
item, with a checkbox toggling `completed`/`completedAt` via a new
`PATCH app/api/habits/occurrences/[id]/route.ts` endpoint. Color comes
from the existing `useAppThemeColors().colorFor(sourceApp ?? 'default')`
— no new theming plumbing needed, since `sourceApp` reuses the same
`AppId` values every other themed surface already keys off.

### 6. Error handling

- **AI call fails or returns invalid JSON:** Screen 2 opens anyway with
  `title` = the user's raw input, `sourceApp: null` (renders as
  "General"), `isRecurring: false`. The user can still edit and create
  — the AI is an assist, never a blocker.
- **Occurrence materialization fails on create:** the `Habit` row still
  saves; My Day's lazy on-demand materialization (section 1) fills the
  gap the next time that date range is requested. Logged, not retried
  synchronously.
- **Unknown/stale `sourceApp` on read** (e.g. an app was renamed/removed
  after a habit was created): falls back to "General" coloring rather
  than throwing.

### 7. Testing

- Unit tests for `materializeOccurrences()`: daily, weekday-set
  (including "Mon-Fri" as a 5-element set), every-N-weeks interval,
  each `endType` (never capped at the 60-day window, on_date, after_n),
  and idempotency (calling it twice doesn't duplicate rows, via the
  `@@unique([habitId, date])` constraint).
- Route test for `classify-habit`: mocks the OpenRouter client,
  asserts the JSON-shape validation rejects a malformed response and
  falls through to the "General"/non-recurring default described in
  Error handling.
- Manual verification: create a recurring habit end-to-end, confirm it
  appears in My Day with the right app color, and that checking it off
  persists across a reload.
