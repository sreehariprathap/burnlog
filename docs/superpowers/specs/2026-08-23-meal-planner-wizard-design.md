# Meal Planner Wizard — Design

## Problem

Meal planning today is a byproduct of onboarding: `GroceryStep`/`NutritionStep` collect store/budget/diet answers once, and `app/api/ai/meal-plan/route.ts` uses them to silently generate a full 7-day plan straight into `MealPlanEntry`. There's no repeatable, on-demand planning flow, no meal choice (the AI just picks for you), no household-size/cook-mode awareness, no kitchen-appliance awareness, no persisted grocery list, and no notifications tied to "when do I actually plan/shop."

This spec adds a standalone **Meal Planner wizard** the user can run any week, plus the connective tissue (onboarding question, recurring + one-off reminders, dashboard surface) that makes it a habit rather than a one-off.

## Non-goals

- Drag-and-drop day reassignment — tap-to-swap only (no DnD library exists in this repo; adding one for a 7×N grid isn't justified).
- Price-accurate grocery budgets — the existing `estimatedWeeklyBudget` free-text-range approach is kept (AI estimate, not a priced integration with any store).
- Per-user timezone support anywhere else in the app — this spec adds timezone capture *scoped to* the meal-prep reminder; it does not retrofit the existing evening check-in cron.
- Multi-device conflict resolution for concurrent wizard runs — last write wins, same as `MealPlanEntry`'s existing upsert semantics.

## Data model

```prisma
model Profile {
  // ...existing fields...
  mealPrepDayOfWeek       Int?      // 0=Sun..6=Sat, recurring weekly trigger
  mealPrepTime            String?   // "HH:mm", local to mealPrepTimezone
  mealPrepTimezone        String?   // IANA tz, auto-captured client-side
  lastMealPlanGeneratedAt DateTime?

  GroceryList        GroceryList[]
  ScheduledReminder   ScheduledReminder[]
}
```

`Profile.lifestyle` (existing `Json?`, typed via `LifestyleAnswers`) gains:

```ts
// lib/ai/types.ts
export const CUISINE_STYLES = [
  'Continental', 'Canadian', 'Indian', 'Italian', 'Mexican', 'Chinese',
  'Thai', 'Mediterranean', 'Middle Eastern', 'Japanese', 'Other',
] as const;

export const KITCHEN_APPLIANCES = [
  'Stove (gas)', 'Stove (electric/induction)', 'Oven', 'Microwave',
  'Air Fryer', 'Toaster', 'Slow Cooker', 'Instant Pot / Pressure Cooker',
  'Blender', 'Rice Cooker', 'Grill / BBQ',
] as const;

export type MealPlanningAnswers = {
  householdSize: number; // people to cook for
  cookMode: 'weekly_batch' | 'fresh_daily';
  cuisinePreferences: string[]; // [] when surpriseMe is true
  surpriseMe: boolean;
  kitchenAppliances: string[];
};
```

added as `LifestyleAnswers.mealPlanning?: MealPlanningAnswers`. Persisted the same way `grocery`/`nutrition` already are — no new columns, reuses the existing JSON-blob + upsert pattern.

`GROCERY_STORES` gains `'Indian Grocery Store'`, `'Save-On-Foods'`, `'T&T Supermarket'`, and a sentinel `'Manual — I already have ingredients'`. When the sentinel is selected, the wizard's store step is replaced by a free-text/tag pantry-item input (`onHandIngredients: string[]`), passed to the AI prompt as "use these on-hand ingredients first, minimize new purchases" instead of "prioritize ingredients at `<store>`."

New models:

```prisma
/// this week's generated grocery list — one active row per profile, upserted per wizard run
model GroceryList {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile   @relation(fields: [profileId], references: [id])
  profileId       String    @unique @db.Uuid
  items           Json      // { "Produce": ["..."], "Protein": ["..."], ... }
  estimatedBudget String?
  shoppingAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("grocery_lists")
}

/// generic scheduled push: one-off (remindAt) or weekly-recurring (dayOfWeek+timeOfDay+timezone)
model ScheduledReminder {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id])
  profileId   String    @db.Uuid
  title       String
  message     String
  url         String
  remindAt    DateTime? // one-off: absolute UTC instant
  dayOfWeek   Int?      // recurring: 0=Sun..6=Sat
  timeOfDay   String?   // recurring: "HH:mm" local to timezone
  timezone    String?   // recurring: IANA tz
  lastSentAt  DateTime? @db.Date // recurring dedupe: last local calendar date it fired
  sentAt      DateTime? // one-off: set once sent, then never resent
  createdAt   DateTime  @default(now())

  @@map("scheduled_reminders")
}
```

A row is either one-off (`remindAt` set, `dayOfWeek`/`timeOfDay`/`timezone` null) or recurring (the reverse) — enforced at the application layer, not the DB, consistent with how other polymorphic-ish rows in this schema (e.g. `MealPlanEntry.mealType` as a free string) are handled.

## Wizard flow

New route `app/(burnlog)/meal-planner/` (multi-step client component, modeled on the existing `ai-setup` step components — one `_components/<Step>.tsx` per screen, shared wizard state via `useState`/`useReducer` in the page, no new form library).

1. **Where are you shopping?** — `GROCERY_STORES` picker (reuses the existing component pattern from `GroceryStep.tsx`) or the manual-ingredients sentinel → free-text pantry input.
2. **Who are you cooking for, and how?** — household size (number stepper) + cook mode: "Batch cook once, eat all week" vs "Fresh each time."
3. **What do you feel like eating?** — meals/day (prefilled from `nutrition.mealsPerDay`), cuisine multi-select from `CUISINE_STYLES`, or a "Surprise me" toggle that hides/clears the cuisine picker.
4. **Cooking at home?** — if yes, `KITCHEN_APPLIANCES` multi-select, prefilled from the profile's saved `mealPlanning.kitchenAppliances` (so it's edit-not-reenter after the first run); if no, skipped (AI is told to assume no cooking, prioritize no-cook/ready-to-eat options).
5. **Pick your meals** — AI call (extended `meal-plan` prompt below) returns 10-12 candidate meals, tagged with suggested `mealType` and macro/prep info. User taps to select — batch mode suggests selecting ~3-4 recipes (repeated across days), fresh mode suggests ~`mealsPerDay × 7`. A running count guides them ("3 of 4 selected").
6. **Arrange your week** — 7×`mealsPerDay` grid, auto-filled from the selection (round-robin for batch mode, sequential for fresh mode). Tap a slot, tap another slot → they swap. Confirm persists to `MealPlanEntry` via the existing `onConflict: 'profileId,dayOfWeek,mealType'` upsert — no schema change here.
7. **Grocery list** — second AI call (or extended response from step 5's call — see below) returns the categorized list + budget estimate scaled to household size and servings actually used; upserted into `GroceryList`.
8. **When are you shopping?** — date + time picker → creates a one-off `ScheduledReminder` (`remindAt` = that instant, `title: "Grocery run"`, `url: "/meal-planner/grocery-list"`).

Step 5/7 split: generating 10-12 candidates and a final priced grocery list in one AI call is wasteful (the grocery list depends on which meals get *selected*, not all 12 candidates). Two calls: `POST /api/ai/meal-plan/candidates` (store/manual, household size, cook mode, cuisine/surprise, appliances, mealsPerDay → 10-12 candidate meals, no persistence) and `POST /api/ai/meal-plan/finalize` (the chosen day-grid → persists `MealPlanEntry` rows + generates/persists the `GroceryList`). This replaces the current single `app/api/ai/meal-plan/route.ts` — same OpenRouter client/model-config plumbing, split into two routes.

A small `/meal-planner/grocery-list` view (read-only, for the shopping-day notification's click-through) renders the persisted `GroceryList.items` grouped by category with the budget estimate.

## Reminders

One new cron endpoint, `app/api/cron/scheduled-reminders/route.ts`, same `CRON_SECRET` bearer-auth pattern as `evening-checkin`, scheduled every 15 minutes in `vercel.json`:

```json
{ "path": "/api/cron/scheduled-reminders", "schedule": "*/15 * * * *" }
```

Each run:
- **One-off**: `WHERE sentAt IS NULL AND remindAt <= now()` → `sendPushToUser`, set `sentAt`.
- **Recurring**: for rows with `dayOfWeek`/`timeOfDay`/`timezone` set, compute "now" in that timezone (via `Intl.DateTimeFormat` with the stored IANA zone), check if today's weekday matches `dayOfWeek`, the local time has just passed `timeOfDay` (within the 15-minute window), and `lastSentAt` isn't already today's local date → send, set `lastSentAt`.

Errors per-row are caught and logged, matching `evening-checkin`'s "one failure doesn't abort the batch" behavior; route returns a `{ sent, skipped, errors }` summary.

**Onboarding**: a new step (placed after the existing grocery/nutrition steps in both `ai-setup` and `goals` flows) asks "What day do you usually plan/prep meals?" (day picker) + a time picker. On submit, the client captures `Intl.DateTimeFormat().resolvedOptions().timeZone` and the flow upserts one recurring `ScheduledReminder` row (title: `"Time to plan your meals 🍽️"`, url: `/meal-planner`) plus writes `mealPrepDayOfWeek`/`mealPrepTime`/`mealPrepTimezone` onto `Profile` (source of truth for the dashboard banner; the `ScheduledReminder` row is what the cron actually reads). Editable later from `app/profile/page.tsx` alongside the water-tracker settings block, re-upserting the same reminder row.

**Dashboard banner**: new small component on the dashboard, shown when `isSameLocalDay(today, mealPrepDayOfWeek)` (reusing the existing helper) AND `lastMealPlanGeneratedAt` is null or falls before the start of the current week — "Time to plan this week's meals" → links to `/meal-planner`. `lastMealPlanGeneratedAt` is stamped in the `finalize` route alongside the `MealPlanEntry` upsert.

## Testing

No automated test framework in this repo (consistent with prior specs). Manual verification:
- `npx tsc --noEmit` after every task.
- Full wizard run in-browser (Chrome DevTools MCP): manual store, Costco, and the manual-ingredients bypass; batch and fresh cook modes; surprise-me on/off; swap two filled day-slots and confirm persistence after reload.
- `npx prisma db push` for the new models/columns before any UI work touching them, same pattern as prior schema-change specs.
- Hit `/api/cron/scheduled-reminders` locally with a seeded one-off row due now, and a seeded recurring row matching the current local weekday/time window; confirm exactly one push each, and confirm a second immediate hit does not double-send either.
- Confirm the dashboard banner appears only on the configured meal-prep day and disappears after completing the wizard.

## Explicitly out of scope

- Per-store real pricing/inventory integration.
- Editing a `GroceryList` after generation (regenerate via re-running the wizard instead).
- Notification for meals within a day (e.g. "time to cook lunch") — only the two reminder types above.
