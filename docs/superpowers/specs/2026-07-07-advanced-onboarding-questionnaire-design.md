# Advanced Multi-Page Onboarding Questionnaire (Admin-Toggleable)

## Context

The existing `/ai-setup` flow (Consent -> Lifestyle -> Preview & edit, see
`2026-07-03-ai-workout-onboarding-design.md`) collects exactly the 7 fields the workout-plan
prompt consumes. This spec adds four new, richer pages after Lifestyle - Goals, Activity
Preferences, Equipment & Environment, Nutrition Habits - each independently toggleable by an
admin via a gear icon on the Profile page. This is the "feature-flagged onboarding pages"
sub-project deferred from earlier planning.

**Explicitly out of scope:** wiring this new data into any AI prompt. `lib/ai/openrouter.ts`'s
plan-generation prompt is unchanged - it still only reads the 7 Lifestyle fields + profile
stats. The four new pages collect and persist data for future AI features (a goals generator,
insights commentary, etc.) to consume later; those are separate, not-yet-specced sub-projects.

## Data model

### `onboarding_page_flags` (new table)

```prisma
model OnboardingPageFlag {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageKey   String   @unique
  label     String
  isEnabled Boolean  @default(true)
  createdAt DateTime @default(now())

  @@map("onboarding_page_flags")
}
```

Seeded with exactly 4 rows (via a one-off insert, not a Prisma seed script change - this repo's
`prisma/seed.js` seeds a different thing and isn't part of this feature):

| pageKey | label |
|---|---|
| `goals` | Goals |
| `activity_preferences` | Activity Preferences |
| `equipment` | Equipment & Environment |
| `nutrition` | Nutrition Habits |

All default `isEnabled: true` (ships on; admin can turn off).

**RLS:** any authenticated user can `select` (the `/ai-setup` flow needs to read this to know
which pages to show); only admins can `update`. Concretely, add a policy using the same
`profiles.isAdmin` check pattern already implied elsewhere in this app:

```sql
alter table onboarding_page_flags enable row level security;

create policy "onboarding_page_flags_select_all"
  on onboarding_page_flags for select
  using (true);

create policy "onboarding_page_flags_update_admin_only"
  on onboarding_page_flags for update
  using (exists (
    select 1 from profiles
    where profiles."userId" = auth.uid() and profiles."isAdmin" = true
  ));
```

### Goals page -> `fitness_goals` table (existing, no schema change)

Reuses the exact same `goalType`/`targetValue` shape `app/goals/_components/AddGoalForm.tsx`
already writes. The same `GOAL_TYPES` list (weight_loss, weight_gain, calories_burned,
running_distance, workout_frequency, workout_time) is extracted to a shared file so both
`AddGoalForm.tsx` and the new onboarding Goals page use one source of truth instead of
duplicating the list:

**New file `lib/goalTypes.ts`:**

```ts
export const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss (kg)' },
  { value: 'weight_gain', label: 'Weight Gain (kg)' },
  { value: 'calories_burned', label: 'Daily Calories Burned (kcal)' },
  { value: 'running_distance', label: 'Running Distance (km)' },
  { value: 'workout_frequency', label: 'Weekly Workouts (count)' },
  { value: 'workout_time', label: 'Workout Duration (mins)' },
] as const;
```

`AddGoalForm.tsx`'s existing inline `GOAL_TYPES` const is replaced with an import from this file
(pure refactor, no behavior change there).

### Activity Preferences / Equipment & Environment / Nutrition Habits -> `profiles.lifestyle` JSON

No new columns. `lib/ai/types.ts`'s `LifestyleAnswers` type gains three new **optional** nested
fields so existing rows (saved before this feature existed) remain valid:

```ts
export type ActivityPreferences = {
  enjoyedTypes: string[]; // subset of ACTIVITY_TYPES values
  dislikedTypes: string[];
  environment: 'indoor' | 'outdoor' | 'either';
  social: 'solo' | 'group' | 'either';
};

export type EquipmentAnswers = {
  trainingLocation: 'commercial_gym' | 'home_gym' | 'bodyweight_only' | 'mixed';
  availableEquipment: string[]; // subset of EQUIPMENT_OPTIONS values
};

export type NutritionAnswers = {
  dietStyle: 'none' | 'vegetarian' | 'vegan' | 'keto' | 'paleo' | 'other';
  mealsPerDay: number;
  restrictions: string; // free text, optional
};

export type LifestyleAnswers = {
  // ...existing 7 fields, unchanged
  activityPreferences?: ActivityPreferences;
  equipment?: EquipmentAnswers;
  nutrition?: NutritionAnswers;
};
```

`ACTIVITY_TYPES` = `['Weights', 'Cardio', 'Sports', 'Yoga', 'HIIT', 'Swimming']`.
`EQUIPMENT_OPTIONS` = `['Dumbbells', 'Barbell', 'Resistance Bands', 'Pull-up Bar', 'Cardio Machine', 'Kettlebell', 'None']`.
Both defined as constants in `lib/ai/types.ts` alongside the new types.

## Flow

`app/ai-setup/_components/AiSetupFlow.tsx`'s `Step` type grows from
`'loading' | 'consent' | 'questionnaire' | 'generating' | 'preview' | 'error'` to also include
`'goals' | 'activity_preferences' | 'equipment' | 'nutrition'`, inserted between
`'questionnaire'` (the existing Lifestyle page, unchanged) and `'generating'`.

On load, alongside fetching `profile.id`/`profile.lifestyle`, also fetch
`onboarding_page_flags` (`select pageKey, isEnabled`) and compute an ordered list of enabled
page keys: `['goals', 'activity_preferences', 'equipment', 'nutrition'].filter(enabled)`. After
the Lifestyle step's `onSubmit`, instead of jumping straight to `'generating'`, advance through
this enabled-pages list in order (skipping disabled ones entirely - a disabled page is never
shown, not shown-then-skippable). Once the list is exhausted, proceed to `'generating'` exactly
as today.

Each of the four new step components (`GoalsStep.tsx`, `ActivityPreferencesStep.tsx`,
`EquipmentStep.tsx`, `NutritionStep.tsx`, new files under `app/ai-setup/_components/`) takes
`onContinue(answers)` and `onSkip()` callbacks - both just advance to the next enabled step (or
to `'generating'` if this was the last one); `onSkip` passes `undefined`/empty data instead of
whatever was entered. Nothing is written to the database at this point - all four pages' answers
accumulate in `AiSetupFlow`'s local state (`goals: GoalEntry[]`, `activityPreferences`,
`equipment`, `nutrition`) until the final Save.

**Goals page UI:** a list of added goals (type + target value, using `GOAL_TYPES` from
`lib/goalTypes.ts`, each removable) plus an "Add another goal" control, mirroring
`AddGoalForm.tsx`'s picker. Zero goals is valid (equivalent to Skip).

**Activity Preferences / Equipment / Nutrition UI:** straightforward forms per the field lists
above - multi-select via checkboxes (matching this app's existing checkbox-list pattern from
`WorkoutChecklist`/session loggers), single-select via the same `Select` component
`LifestyleForm.tsx` already uses.

## Save behavior (extends existing `handleSave` in `AiSetupFlow.tsx`)

Unchanged: `workout_plans` upsert, `profiles.aiEnabled = true`.

Extended:
- `profiles.lifestyle` is saved as `{ ...lifestyleFromQuestionnaireStep, activityPreferences, equipment, nutrition }` - the three new keys merged in only if that page was enabled and reached (otherwise `undefined`, matching the optional type).
- Each entry in the local `goals` array becomes one `fitness_goals` insert (`profileId`, `goalType`, `targetValue`), same shape `AddGoalForm.tsx` already writes.

Still nothing is saved until this single final confirm - if the user cancels/skips out of the
whole flow at any step, none of the four new pages' data (or the plan) touches the database,
same invariant as today.

## Admin gear icon + toggle panel

`app/profile/page.tsx`, admin-only section (`profile.isAdmin`): a small gear icon button next
to "Test Push Notifications" opens a Dialog (new component
`app/profile/_components/OnboardingPageTogglesModal.tsx`) listing the 4 pages by `label`, each
with a `Switch` (same Radix component `AddWorkoutModal.tsx` already uses for "Repeat every
week"). Toggling writes immediately:

```ts
await supabase.from('onboarding_page_flags').update({ isEnabled: next }).eq('pageKey', pageKey);
```

No separate "Save" button - matches this page's existing instant-action pattern (Send Test
Push). The modal fetches current flag state on open.

## Testing / verification

- `tsc --noEmit` clean.
- Manual browser verification (disposable test account, one with `isAdmin: true` for the toggle
  checks):
  - Confirm all 4 pages appear (in order) between Lifestyle and Preview when all flags are
    enabled (the seeded default).
  - As admin, disable 2 of the 4 pages via the gear icon. Re-run `/ai-setup` as a normal user -
    confirm only the 2 still-enabled pages appear, in the correct relative order.
  - On the Goals page, add two goals, skip Activity Preferences, fill in Equipment, fill in
    Nutrition, reach Preview, Save. Confirm via SQL: 2 new `fitness_goals` rows: correct
    `equipment`/`nutrition` keys present in `profiles.lifestyle`, no `activityPreferences` key
    (since it was skipped with nothing entered - or an empty-shape value, whichever the
    implementation naturally produces; confirm it doesn't crash `PlanPreview` or break existing
    `lifestyle` consumers).
  - Confirm existing rows with old-shape `lifestyle` (no new keys) still load fine in the
    Lifestyle pre-fill step (Task 2 from the previous plan) - the new fields being optional
    means no migration is needed for existing data.
  - Re-enable all 4 flags after testing.
- Clean up all test data (fitness_goals rows, lifestyle, workout_plans, onboarding_page_flags
  state) after verification.

## Out of scope

- Wiring any of this new data into `lib/ai/openrouter.ts`'s prompt - future spec once a concrete
  AI consumer (goals generator, insights, etc.) is designed.
- A general feature-flag framework beyond these 4 onboarding pages.
- Editing/removing already-saved goals from within `/ai-setup` (only adding new ones) - editing
  existing goals is already handled by the existing Goals tab.
