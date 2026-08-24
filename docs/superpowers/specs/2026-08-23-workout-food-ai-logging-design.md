# Workout activity picker + AI food/workout calorie estimation

Date: 2026-08-23

## Problem

Two logging flows are too narrow:

1. **Log Workout** (dashboard quick-log `LogWorkoutModal`, and the structured-session `CardioLogger`) only offers a handful of activity types (Gym/Cycling/Swimming/Other, or a 5-item checkbox list), has no way to record distance, and the AI calorie estimate only ever sees `activityType` + `durationMinutes`. Users doing common activities like badminton, soccer, running, walking, hiking etc. have no good option, and "Other" gives the AI nothing to work with.
2. **Log Calories** (`LogCaloriesModal`) supports manual entry and AI photo-scanning, but has no text-based AI estimate. Users who eat something (possibly several items — "coffee + pancake + banana") have to either photograph it or manually guess calories/macros themselves.

## Goals

- Give users a broad list of common workout activities plus a genuine "Other" escape hatch that still feeds the AI useful context (a short free-text description).
- Let users optionally log distance covered; duration remains the primary driver of the calorie calculation.
- Add a text-based AI calorie estimate for food, parallel to the existing AI workout-calorie estimate, supporting multi-item descriptions.
- Bring the structured-session cardio loggers (`CardioLogger`, `OutdoorCardioLogger`, `ActiveCommuteLogger`) to parity with the quick-log flow: they should also produce and persist a calorie estimate, since today they either don't compute one or compute-and-discard it.

## Non-goals

- No changes to strength-based session loggers (`PushPullLegLogger`, `FullBodyLogger`, `BodyweightLogger`, `RestLogger`) — they have no calorie-relevant fields today and aren't part of this request.
- No changes to the goals-page components (`CalorieTracker`, `FoodIntakeTracker`, `FoodScanner`) — they read from `calorie_burns` / `food_intakes` and will pick up new rows automatically.
- No database schema migrations. `calorie_burns.notes` and `food_intakes.notes` (both already nullable `text`) are reused to store distance/description/itemization instead of adding columns.

## Design

### 1. Shared activity list (`lib/workoutActivities.ts`)

New module exporting:

```ts
export const COMMON_ACTIVITIES = [
  'Gym / Weights', 'Running', 'Walking', 'Cycling', 'Swimming', 'Hiking',
  'Yoga', 'HIIT', 'Rowing', 'Elliptical', 'Basketball', 'Soccer',
  'Badminton', 'Tennis', 'Dancing', 'Other',
] as const;

export function formatWorkoutNotes(distanceKm?: number, description?: string): string | null
```

`formatWorkoutNotes` joins whichever of "Distance: X km" / the free-text description are present, newline-separated, returning `null` if both are absent (so callers can pass it straight into the `notes` column). Used by every workout-logging surface below so the activity list and note-formatting stay consistent in one place.

### 2. `LogWorkoutModal` (dashboard quick-log)

- Replace the 4-item `WORKOUT_TYPES` select with `COMMON_ACTIVITIES`.
- Add an optional **Distance (km)** number input (always visible, blank by default — user skips it if not relevant to the activity).
- When `activityType === 'Other'`, show a required **"Briefly describe what you did"** textarea. Save is blocked until it's filled.
- Duration stays the field that drives the calorie calculation (unchanged behavior); distance and description are estimate-quality inputs, not replacements.
- The existing "AI" button now also sends `distanceKm` (if set) and `description` (if "Other") to the estimate endpoint.
- On save, `notes` is set via `formatWorkoutNotes(distanceKm, description)` and inserted into `calorie_burns` alongside the existing `activityType`/`duration`/`caloriesBurned` fields.

### 3. `estimate-workout-calories` API

Request body gains two optional fields: `distanceKm?: number`, `description?: string`.

Prompt changes:
- If `activityType === 'Other'`, the prompt asks the AI to first infer the actual activity from `description`, then apply a MET-based estimate for that inferred activity.
- If `distanceKm` is present, it's included as pace context ("User covered {distanceKm} km in {durationMinutes} minutes") so the AI can sanity-check intensity (e.g., a 5 km run vs. a 5 km walk in the same 40 minutes implies very different MET values).
- Response shape (`caloriesBurned`, `notes`) is unchanged.

Validation: `description` becomes required server-side when `activityType === 'Other'` (matching the client-side gate), returning a 400 if missing.

### 4. `LogCaloriesModal` — new "Describe (AI)" tab

Tabs become **Manual / Describe (AI) / Photo (AI)**.

New tab contents:
- Textarea: "What did you eat?" with placeholder like "e.g. coffee, 2 pancakes, a banana".
- "Estimate with AI" button, disabled until text is non-empty.
- On success, results pre-fill the Manual tab's fields (`foodName`, `calories`, `protein`, `carbs`, `fat`) exactly like the photo scanner does today, switching the active tab to Manual so the user reviews/edits before saving. The itemized breakdown (if the AI returns one) is appended into `notes` via `handleSave`.

### 5. New API route: `app/api/ai/estimate-food-calories/route.ts`

Mirrors `scan-food/route.ts`'s auth/model-lookup/error-handling structure, but text-only (no vision model, no image).

Request: `{ description: string, mealType?: string }`.

Prompt: instructs the AI to parse a free-text meal description that may list multiple items (delimited by "+", commas, "and", etc.), estimate calories/macros for each item, and sum them.

Response shape:
```json
{
  "foodName": "combined summary, e.g. 'Coffee, pancake, banana'",
  "calories": 420,
  "protein": 12.5,
  "carbs": 60,
  "fat": 14,
  "fiber": 3,
  "items": [{ "name": "Coffee", "calories": 5 }, ...],
  "confidence": "medium",
  "notes": "assumptions made, e.g. serving sizes"
}
```
`items` is used client-side to build the `notes` string saved with the entry (e.g. "Coffee (5 kcal), Pancake (280 kcal), Banana (135 kcal)"); it isn't a separate persisted structure.

### 6. `CardioLogger` (structured session logger) rewrite

Currently: a hardcoded 5-item checkbox multi-select with a minutes field, no distance, no calories.

New version, matching `OutdoorCardioLogger`'s existing layout pattern:
- Single-select activity from `COMMON_ACTIVITIES` (dropdown).
- Duration (minutes) input.
- Optional Distance (km) input.
- "Other" reveals the same required description textarea as `LogWorkoutModal`.
- "Estimate with AI" button calling `estimate-workout-calories` (same endpoint as the quick-log flow), with an editable calories field for manual override.
- `onEnd` payload becomes: `{ activityType: string, durationMinutes: number, distanceKm?: number, caloriesBurned: number, notes?: string }`.

### 7. `OutdoorCardioLogger` and `ActiveCommuteLogger` — calorie parity fix

Both already collect duration + distance but currently drop the calorie number on the floor:

- **`OutdoorCardioLogger`**: add an "Estimate with AI" step (same endpoint, using its existing `activityType`/`durationMinutes`/`distanceKm`/`notes` as the description context) before `onEnd` fires, or compute inline when the user taps "Finish Outdoor Session" if no estimate has been fetched yet. `onEnd` payload adds `caloriesBurned`, standardized to the same field names as `CardioLogger`.
- **`ActiveCommuteLogger`**: no AI call needed — it already computes `caloriesEstimate` via a fixed formula (cal/min by mode). Fix: pass that computed value through in `onEnd` instead of discarding it, and rename fields to match the standardized shape (`activityType: mode === 'cycle' ? 'Cycling' : 'Walking'`, `durationMinutes: totalDuration`, `distanceKm: totalDistance`, `caloriesBurned: caloriesEstimate`, `notes`).

All three loggers now emit the same `{ activityType, durationMinutes, distanceKm?, caloriesBurned, notes? }` shape from `onEnd`.

### 8. `CompletionTracker` — persist calories from cardio sessions

Today `CompletionTracker` only inserts into `sessions` (as `sessionData` JSON). It already fetches `profileData.id` for the streak/XP update, so no new lookup is needed.

Change: after building `sessionData` (unchanged), if `exerciseLog` has a numeric `caloriesBurned` field, also insert a row into `calorie_burns`:

```ts
{
  profileId: profileData.id,
  activityType: exerciseLog.activityType,
  duration: exerciseLog.durationMinutes,
  caloriesBurned: exerciseLog.caloriesBurned,
  notes: exerciseLog.notes ?? null,
}
```

This insert runs alongside (not instead of) the existing `sessions` insert — both rows describe the same workout from different angles (structured plan completion vs. calorie ledger), matching how the quick-log flow already writes directly to `calorie_burns`.

Strength loggers' `exerciseLog` objects have no `caloriesBurned` field, so this branch is simply skipped for them — no behavior change there.

## Data flow summary

```
LogWorkoutModal ──┐
CardioLogger ──────┼──> estimate-workout-calories (AI) ──> caloriesBurned ──> calorie_burns table
OutdoorCardioLogger┘

LogCaloriesModal (Describe tab) ──> estimate-food-calories (AI, new) ──> food_intakes table
LogCaloriesModal (Photo tab)    ──> scan-food (AI, existing)         ──> food_intakes table

ActiveCommuteLogger ──> (existing formula, now passed through) ──> calorie_burns table
```

## Testing

- Manual: exercise each modal/logger's new fields (activity list, distance, Other+description, AI estimate button) and confirm saved rows in `calorie_burns`/`food_intakes` via Supabase.
- Manual: complete a Cardio, Outdoor Cardio, and Active Commute session end-to-end and confirm both a `sessions` row and a `calorie_burns` row are created.
- Manual: verify strength-session completion (e.g. Push day) still saves only to `sessions`, no `calorie_burns` row, no errors.
- No new automated test infra exists in this repo for these flows; verification is manual via the running app (per `/verify`).
