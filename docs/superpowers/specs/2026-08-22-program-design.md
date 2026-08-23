# 8-Week Program Feature — Design

> Implements Phase 3+4 of `docs/superpowers/specs/2026-08-22-plan-page-roadmap.md`,
> triggered by the user pasting a concrete AI-generated transformation-plan
> HTML mockup ("The Ridge Line") as the reference for the feature's shape:
> header stats, a "ridge" progress visualization across weeks, a rules
> checklist, a static weekday template, nutrition guidance with a flex-meal
> callout, and a week-by-week accordion with per-week checklists.

## Context correction (important)

This codebase evolved outside earlier planning in this session: it's now
two app modes (`burnlog`/`lifelog`, via `lib/appMode.ts`) under Next.js
route groups (`app/(burnlog)/`, `app/(lifelog)/`), and — critically — a
**persisted weekly meal-plan system already exists** (`MealPlanEntry` +
`MealPlanCheckIn`, wired into `app/(burnlog)/session/_components/MealChecklist.tsx`,
actively under concurrent development). This directly contradicts an
earlier assumption in this session that AI-generated meal plans were
ephemeral. This spec is written against the *current* state, confirmed by
direct inspection immediately before writing it.

**Consequence for scope:** the Program feature does NOT rebuild meal-plan
tracking. `MealPlanEntry`/`MealChecklist` already covers "what specific
meal today, checked off" at the weekday-template level. The Program's own
"meal plan" section is a different altitude: general nutrition *guidance*
(the mockup's Meal 1 / Meal 2 / Evening Shake / snacks / flex-meal
philosophy), stored as static text on the Program itself, not a duplicate
per-day roster.

## Scope

**In scope:**
- A `Program` (title, subtitle, total weeks, start/target weight, rules,
  nutrition guidance) + `ProgramWeek` (per-week title, subtitle, weekend
  activity suggestions for two companion modes, checklist) data model.
- AI ingestion: paste freeform plan text (exactly like what kicked off
  this whole feature) → structured into the schema above → review → save.
- A read view: header stats, ridge progress visualization, rules card,
  weekday template (read-only, from existing `WorkoutPlan`), nutrition
  guidance card, and a week-by-week accordion with persisted checklist
  state.
- Milestone XP when a week's checklist is fully checked.
- A third tab ("Program") on the existing Plan page's Day/Month toggle.

**Explicitly out of scope (per the roadmap's original phasing, still
holds):**
- Editing a generated program field-by-field before saving — v1 is
  generate → review → save or regenerate, not an editable grid like the
  AI workout-onboarding flow has. Cheap to add later once the schema is
  proven.
- Program history — starting a new program replaces the old one.
- Water reminders, weigh-in reminders, or any new cron/push work.
- Touching `WorkoutPlan`'s own editing UI (`PlanCard`, `AddWorkoutModal`)
  — the Program's weekday template section only *reads* `workout_plans`;
  writing to it during program creation reuses the same upsert pattern
  `AiSetupFlow` already established, not a new editing surface.

## Data model

```prisma
model Program {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile      Profile  @relation(fields: [profileId], references: [id])
  profileId    String   @unique @db.Uuid
  title        String
  subtitle     String?
  totalWeeks   Int
  startWeight  Float?
  targetWeight Float?
  startDate    DateTime @default(now()) @db.Date
  rules        Json     // string[]
  mealPlan     Json     // { meal1: string[]; meal2: string[]; eveningShake: string[]; snacks: string[]; flexMealNote: string }
  createdAt    DateTime @default(now())

  weeks ProgramWeek[]

  @@map("programs")
}

model ProgramWeek {
  id               String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  program          Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  programId        String  @db.Uuid
  weekIndex        Int     // 1-based
  title            String
  subtitle         String?
  socialActivity   String?
  soloActivity     String?
  checklist        Json    // { label: string; checked: boolean }[]
  milestoneAwarded Boolean @default(false)

  @@unique([programId, weekIndex])
  @@map("program_weeks")
}
```

`Program.profileId @unique` enforces one active program per profile.
`onDelete: Cascade` on `ProgramWeek.program` means replacing a program is
just "delete the old `programs` row, insert a new one + its weeks" — no
manual week cleanup needed.

The weekday template is **not** duplicated here — it lives in the
existing `WorkoutPlan` table, upserted at program-save time exactly the
way `AiSetupFlow.handleSave()` already does it.

## AI ingestion

New `lib/ai/program.ts`, following the exact pattern of
`lib/ai/openrouter.ts`'s `generateWorkoutPlan`/`validatePlan`:

- `buildProgramPrompt(profile, pastedPlanText)`: embeds the profile's
  age/weight/height and the user's pasted freeform plan text, instructs
  the model to extract/structure it into the JSON shape below. Explicitly
  tells the model: if the pasted text doesn't specify something (e.g. no
  target weight given), use `null`/a sensible default rather than
  inventing specifics.
- Response shape:
  ```json
  {
    "title": "string",
    "subtitle": "string",
    "totalWeeks": 8,
    "startWeight": 104,
    "targetWeight": 97,
    "rules": ["string", "..."],
    "weekdayTemplate": [{"dayOfWeek": 0, "bodyPart": "Rest"}, "...7 entries covering 0-6"],
    "mealPlan": {
      "meal1": ["string", "..."],
      "meal2": ["string", "..."],
      "eveningShake": ["string", "..."],
      "snacks": ["string", "..."],
      "flexMealNote": "string"
    },
    "weeks": [
      {"weekIndex": 1, "title": "string", "subtitle": "string", "socialActivity": "string", "soloActivity": "string", "checklist": ["string", "..."]}
    ]
  }
  ```
- `validateProgramPlan(raw)`: hand-rolled validation matching
  `validatePlan`'s style — checks every field's type, `weekdayTemplate`
  covers all 7 `dayOfWeek` values 0-6 exactly once with a `bodyPart` from
  `BODY_PARTS`, `weeks.length === totalWeeks`, `weekIndex` values are
  `1..totalWeeks` each exactly once, `checklist` arrays are non-empty
  string arrays, `mealPlan`'s four list fields are string arrays and
  `flexMealNote` is a string. Throws a descriptive `Error` on any
  violation (never silently coerces).
- `generateProgram(profile, pastedPlanText, model)`: calls OpenRouter with
  `response_format: json_object`, parses, validates — same shape as
  `generateWorkoutPlan`.

New route `app/api/ai/program/route.ts`: auth check, reads profile,
resolves model via `getModel(supabase, 'text')`, calls `generateProgram`
with one retry on failure (mirroring `workout-plan/route.ts` exactly),
returns `{ program }` or a `formatAiError`-formatted error.

## UI

### `ProgramCreateFlow` (new)
Shown when the profile has no `Program` row yet. A textarea for pasting
plan text + "Generate Program" button → calls the new API route → on
success shows a read-only review of the generated structure (title,
weeks list, rules, meal guidance) with "Save Program" and "Regenerate"
actions. Saving:
1. Upserts 7 `workout_plans` rows from `weekdayTemplate`
   (`onConflict: 'profileId,dayOfWeek'`).
2. Deletes any existing `programs` row for the profile (cascades its
   weeks), then inserts the new `programs` row and its `program_weeks`
   rows.

### `RidgeProgress` (new, pure/presentational)
Props: `{ weeks: { weekIndex: number; complete: boolean }[]; onSelectWeek?: (weekIndex: number) => void }`.
Renders the mockup's SVG ridge line with one peak dot per week — filled
("done") if that week's `complete` is true, highlighted ("current") for
the first incomplete week, muted otherwise — reusing the mockup's own
"first incomplete = current" algorithm. Clicking a peak (if
`onSelectWeek` provided) scrolls to / expands that week's accordion
entry.

### `ProgramWeekAccordion` (new)
One collapsible card per week: title/subtitle, two "companion" boxes
(social/solo activity suggestions, styled per the mockup), and the
checklist as checkboxes. Toggling a checkbox updates that week's
`checklist` JSON in place (`{ ...item, checked }`) via a Supabase
`update`. When the update results in every item checked and
`milestoneAwarded` is false: award `+40 XP` (`lib/leveling.ts`'s
`computeLevel` for any resulting level-up), set `milestoneAwarded = true`,
and show the existing `AchievementOverlay` — same reuse pattern as the
dashboard's `ConsistencyTracker`.

### `ProgramView` (new, orchestrator)
Fetches the profile's `Program` + its `ProgramWeek[]` (ordered by
`weekIndex`). Renders `ProgramCreateFlow` if none exists; otherwise:
header stats (title/subtitle, start/target weight, height from the
already-available profile, total weeks), `RidgeProgress`, a Rules card
(checkbox-free, just a reference list — the mockup's rule-checkboxes are
decorative/non-persisted reminders, not a tracked daily state, so this
stays simple), a read-only weekday-template table (queries
`workout_plans` the same way `PlanMonthCalendar` already does), a
nutrition-guidance card (from `Program.mealPlan`, four sections + the
flex-meal callout), and the list of `ProgramWeekAccordion`s.

### Wiring
`components/kokonutui/plan-view-toggle.tsx`: add a third tab (`id:
'program'`, a `Mountain` icon from `lucide-react`, matching the
ridge/trail theme), extend `view`'s type to `'day' | 'month' | 'program'`,
update the `selectedIndex`/`onSelect` index mapping from 2 to 3 options.

`app/(burnlog)/session/page.tsx`: extend the `view` state type to match,
add a third branch rendering `<ProgramView profileId={profileId} />`
alongside the existing Day/Month branches. This is the only edit to a
file outside the new Program-specific files — `PlanCard.tsx`,
`MealChecklist.tsx`, `CompletionTracker.tsx`, and the session-loggers are
all under active concurrent modification and are not touched by this
work at all.

## Testing

No automated test framework in this repo. Manual verification: `npx tsc
--noEmit`, plus in-browser testing (Chrome DevTools MCP) — generate a
program from real pasted plan text (the same text this feature was
requested from), confirm the weekday template and all N weeks appear
correctly, check off a week's full checklist and confirm the milestone
celebration + XP fires exactly once, confirm the ridge updates to mark
that week's peak done and the next incomplete week current, confirm the
schema push and RLS via `mcp__supabase__execute_sql`. Check both light
and dark mode.
