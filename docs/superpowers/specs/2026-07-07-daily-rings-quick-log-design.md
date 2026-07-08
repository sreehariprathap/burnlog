# Daily Rings & Quick Log — Design

## Problem

The dashboard shows long-term goals and static widgets but has no daily, at-a-glance view of "how am I doing today" and no fast way to log calories, workouts, or steps without navigating away.

## Goals

- One glanceable widget on the dashboard showing today's progress against 4 daily targets: calories burned, calories eaten, workout minutes, steps.
- A floating "+" button that opens quick-log modals for calories, workouts, and steps, writing straight to the DB and refreshing the widget.
- Reuse existing tables/endpoints wherever possible (`CalorieBurn`, `FoodIntake`, `/api/ai/scan-food`); only add what's missing (steps storage, workout AI-estimate endpoint).

## Data model

Two new goal types added to `lib/goalTypes.ts`, alongside the existing ones, so they're settable via the existing Goals page / AI-setup flow like any other `fitness_goals` row:

```ts
{ value: 'calories_intake', label: 'Daily Calories Intake (kcal)' },
{ value: 'daily_steps', label: 'Daily Steps (count)' },
```

Defaults used when no matching `fitness_goals` row exists for the user:
- `calories_burned` → 900 kcal
- `calories_intake` → 1800 kcal
- `workout_time` → 30 min
- `daily_steps` → 8000 steps

New Prisma model (steps have no existing table):

```prisma
model StepEntry {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id])
  profileId String   @db.Uuid
  date      DateTime @default(now())
  steps     Int
  createdAt DateTime @default(now())

  @@map("step_entries")
}
```

Add `StepEntry[]` relation to `Profile`. No new tables for calories/workout — `CalorieBurn` already has `caloriesBurned` and `duration`, `FoodIntake` already has `calories`.

## Daily Rings widget

New component `app/dashboard/_components/DailyRingsWidget.tsx`, placed prominently on the dashboard (above or replacing part of the existing 4-widget grid).

- 4 concentric SVG rings, Apple-Watch-style (`<circle>` with `strokeDasharray`/`strokeDashoffset` per ring), each independently animating 0→100%+ of its own goal:
  - Outer: **burn** (orange/red) — today's `sum(CalorieBurn.caloriesBurned)`
  - **eat** (green) — today's `sum(FoodIntake.calories)`
  - **workout minutes** (blue) — today's `sum(CalorieBurn.duration)`
  - Inner: **steps** (purple) — today's `sum(StepEntry.steps)`
- "Today" = rows where `date` falls on the current local calendar day (client-side date-range filter on fetch).
- Targets: read from `fitness_goals` for the current profile (`calories_burned`, `calories_intake`, `workout_time`, `daily_steps`), falling back to hardcoded defaults per metric when absent.
- Ring arcs visually clamp at 100% (full circle), but values can exceed 100% underneath.
- Center of the rings: today's **steps count** (biggest, most glanceable number).
- Below the rings: a small legend listing all 4 metrics as `value / target` with matching ring colors, and a subtle note "using default goal" for any metric without a `fitness_goals` row.
- Widget accepts a `refreshKey`/refetch trigger so it can be told to reload after a quick-log modal saves, without a full page reload.

## Quick-log entry point

Floating action button, fixed bottom-right above `BottomNav`, `+` icon (lucide `Plus`). Tapping it opens a `Dialog` listing 3 options, each opening its own modal:

1. **Log Calories**
2. **Log Workout**
3. **Log Steps**

All three modals live under `app/dashboard/_components/quick-log/`, are self-contained, and share a common save contract: on successful save they call an `onSaved()` callback that closes the modal and bumps the dashboard's refresh trigger for `DailyRingsWidget`.

### Log Calories modal

Two-tab UI:
- **Manual**: mealType select (reuse existing meal type options), foodName, calories, optional protein/carbs/fat. Writes directly to `FoodIntake`.
- **Photo (AI)**: camera/file input → convert to base64 → POST to existing `/api/ai/scan-food` (no backend changes) → response prefills the Manual tab's fields (foodName, calories, macros) → user reviews/edits → save writes to `FoodIntake`.
- AI failure (network error, non-food image, bad JSON) shows an inline error and leaves the Manual tab open/editable so the user can still log without AI.

### Log Workout modal

- Select workout type: Gym, Cycling, Swimming, Other.
- Duration in minutes (number input).
- Calories: **Manual** input, or **Calculate with AI**.
  - AI path calls a new endpoint `POST /api/ai/estimate-workout-calories` with `{ activityType, durationMinutes }`; the route itself loads the authenticated user's profile server-side (weight, age) rather than trusting client-supplied values. Text-only chat completion (no image) prompts an LLM for a MET-based calorie estimate, returning `{ caloriesBurned, notes }` in the same JSON-parsing/error-handling style as `scan-food/route.ts` (using the same OpenRouter client, a text-capable model — reuse `AI_VISION_MODEL`'s sibling or a configurable `AI_TEXT_MODEL` env var, defaulting to a cheap text model).
  - AI failure surfaces inline error, Manual field stays editable.
- Save writes one row to `CalorieBurn` (`activityType`, `duration`, `caloriesBurned`), which feeds both the burn ring and the workout-minutes ring.

### Log Steps modal

- Single number input for step count, optional date field (defaults to today).
- Save writes one row to `StepEntry`.

## Error handling & edge cases

- Missing `fitness_goals` row for a metric → use hardcoded default, legend shows a subtle "(default)" hint.
- AI endpoint failures (scan-food, estimate-workout-calories) → inline error message in the modal; manual entry remains available so the user is never blocked from logging.
- All writes scoped server/client-side to the authenticated user's own `profileId`, consistent with existing patterns (`supabase.auth.getUser()` → `profiles` lookup by `userId`).
- Ring math guards against divide-by-zero (target of 0 treated as default).

## Testing

No automated test suite currently covers dashboard widgets in this repo; verification is manual in-browser (dev server):
- Rings render correctly with seeded/real data for all 4 metrics, including the "no goal set → default used" path.
- `+` button opens the menu; each of the 3 options opens its modal.
- Each modal saves successfully and the rings widget updates without a full page reload.
- AI paths (photo scan, workout estimate) succeed with a valid `NEXT_OPENROUTER_KEY`, and gracefully degrade to manual entry when the AI call fails or returns an error.
