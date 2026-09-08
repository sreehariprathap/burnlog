# Goal-driven workout AI: Plan, Goal, Insights

Date: 2026-09-07
Status: approved, pending implementation plan

## Problem

BurnLog's Plan (workout generation), Goal, and Insights surfaces are only
loosely connected today:

- `profiles.lifestyle.goalFocus` (lose_weight / build_muscle /
  improve_stamina / general_health / athletic_performance) already drives
  the AI workout prompt (`lib/ai/openrouter.ts`), but it's buried inside
  the onboarding flow (`AiSetupFlow`) with no first-class home on the
  Goals page and no way to revisit it without re-running onboarding.
- `fitness_goals` (goalType + targetValue: weight_loss, calories_burned,
  calories_intake, workout_time, daily_steps, running_distance,
  workout_frequency) is a *separate*, older numeric-target ledger that
  feeds daily rings (`DailyRingsWidget`), month activity bars
  (`PlanMonthActivitySummary`), evening-checkin reminders
  (`lib/reminders/eveningCheckin.ts`), and the cohort/benchmark system
  (`lib/intellog/cohort.ts`, `app/api/cron/intel-cohort/route.ts`,
  `app/api/intellog/benchmark/route.ts`). It has no concept of a single
  "primary goal" and isn't goal-focus-aware.
- There's no captured body type / physical capability signal beyond
  freeform `injuries` text and height/weight. The workout prompt can't
  reason about training experience.
- Insights (`InsightsClient`) shows a fixed tab order (weight, calories,
  food, stamina, benchmarks) for every user regardless of what they're
  actually working toward.
- The AI-generated plan already writes into `workout_plans`
  (day-of-week → bodyPart), which the Plan page's day-view slots
  (`session/page.tsx` + `WeekdayTabs`/`PlanCard`) already read — this
  approve-and-push path exists and works; it's just only reachable from
  onboarding today.

## Non-goals

- Not migrating or restructuring `fitness_goals`. It has real
  dependencies (cron jobs, cohort benchmarking, reminders) outside this
  feature's scope, and its multi-metric numeric-target model is doing a
  different job than a single "primary goal" would. Left untouched.
- Not adding AI-generated narrative insight text — Insights dynamism in
  this pass is rule-based only (tab order/emphasis), no new AI calls.
- Not reworking `ProgramCreateFlow` (the paste-a-plan-text → structured
  program feature under Plan → Program view). Separate feature, out of
  scope.
- Not touching `EXERCISES`/`buildWorkoutExercises` in `lib/exercises.ts`
  — already data-driven by bodyPart + equipment, no hardcoded splits to
  remove there. `PushPullLegLogger` already takes `bodyPart` as a prop.

## Design

### 1. Primary goal as first-class, editable outside onboarding

`goalFocus` becomes the single "primary health goal" surfaced on the
Goals page (`app/(burnlog)/burnlog/goals/page.tsx`) as a new goal card
above the existing `GoalsList`/`AddGoalForm` numeric targets. Editing it:

1. Updates `profiles.lifestyle.goalFocus` directly (no full onboarding
   re-run required).
2. Seeds sensible `fitness_goals` defaults for the new focus if the user
   has no existing goal of that metric type yet (e.g. `build_muscle` →
   seed `workout_frequency` + `workout_time` if absent; `lose_weight` →
   seed `calories_burned` if absent). Never overwrites a value the user
   already set.
3. Offers "Regenerate workout plan" inline, reusing the exact
   `PlanPreview` → `handleSave` approve-and-push path that already writes
   to `workout_plans` — just invoked from Goals instead of only from
   `AiSetupFlow`.

`fitness_goals` schema and every consumer of it (rings, benchmarks, cron,
reminders) are unchanged.

### 2. Body type / capability capture

Add to `LifestyleAnswers` (`lib/ai/types.ts`):

```ts
fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
```

Captured via a new step in `AiSetupFlow` (between `HealthBasicsStep` and
`LifestyleForm`, or folded into `LifestyleForm` directly — implementation
plan decides based on existing step-flow ergonomics) and editable from
the same Goals-page goal card as #1. `injuries` (existing freeform text)
and derived BMI (from existing `height`/`weight`) round out the
"body type and physical capabilities" signal — no new somatotype
question, per the approved design conversation.

### 3. Workout generation: goal- and capability-aware, still data-driven

Extend `buildPrompt` in `lib/ai/openrouter.ts`:

- Add `fitnessLevel` to the prompt's Lifestyle section.
- Add explicit guidance keyed off `goalFocus`:
  - `build_muscle` → prefer higher-frequency, split-style training when
    `trainingLocation` allows it (existing Push/Pull/Legs gate on
    commercial_gym/home_gym is unchanged and still the only place
    Push/Pull/Legs can appear).
  - `improve_stamina` / `athletic_performance` → bias toward
    Cardio/Full Body days.
  - `lose_weight` → bias toward Full Body + Cardio mix.
  - `general_health` → today's balanced default, unchanged.
- Add `fitnessLevel` guidance: `beginner` → favor Full Body over split
  days even at a gym, fewer non-rest days at the low end of
  `preferredTrainingDays`; `advanced` → splits fully available to gym
  users.
- No changes to `BODY_PARTS`, `EXERCISES`, `buildWorkoutExercises`, or
  the existing injury-exclusion enforcement
  (`detectExcludedBodyParts`/`enforceExclusions`) — this purely adds more
  signal into the same prompt-building function and the same validated
  output shape (`WorkoutPlanEntry[]`).

### 4. Insights: goal-driven tab order + progress emphasis

`InsightsClient` (and its `insightTabs` array) reorders so the tab
matching the active `goalFocus` leads:

| goalFocus | leading tab |
|---|---|
| lose_weight | weight |
| build_muscle | calories (burn) — closest existing proxy for training load |
| improve_stamina / athletic_performance | stamina |
| general_health | weight (today's default order) |

The leading tab's `MetricSlide` also gets a small goal-progress line
(reusing the existing `calculateForecast`-style logic already built for
weight, generalized to whichever metric leads) when a matching
`fitness_goals` target exists. Purely rule-based ordering + an existing
calculation reused — no new AI calls, no new chart types.

`profileId`'s `lifestyle.goalFocus` is fetched alongside the existing
`weightGoal` query in `insights/page.tsx` and passed down as a new prop.

### 5. Approve → logbook push (already working, just re-exposed)

No new persistence path. `PlanPreview.onSave` already upserts
`workout_plans` keyed by `(profileId, dayOfWeek)`, and the Plan page's
day-view (`WeekdayTabs` + `PlanCard` in `session/page.tsx`) already reads
that table live via `workoutPlanQuery`. Section 1's "Regenerate workout
plan" action on the Goals page reuses this component and this save path
unchanged — the only change is *where* it can be triggered from.

## Data flow summary

```
Goals page (goal card)
  → edit goalFocus / fitnessLevel → profiles.lifestyle
  → seed fitness_goals defaults (only if absent)
  → "Regenerate workout plan"
      → POST /api/ai/workout-plan (buildPrompt now goal+capability-aware)
      → PlanPreview (user reviews/edits/approves)
      → handleSave → upsert workout_plans (existing path, unchanged)
      → Plan page day-view slots read workout_plans (existing, unchanged)

Insights page
  → reads profiles.lifestyle.goalFocus + fitness_goals + existing metric tables
  → InsightsClient reorders tabs, adds goal-progress line to leading tab
```

## Testing

- `lib/ai/openrouter.test.ts`: extend prompt-building tests to cover
  `fitnessLevel` and each `goalFocus` value's guidance text.
- New test for the `fitness_goals` default-seeding logic (seeds only
  when absent, never overwrites).
- `InsightsClient`: test tab-order selection per `goalFocus`, including
  the `general_health` default-order case and the no-goalFocus-set case
  (should fall back to today's order).
- Manual: run through Goals-page goal card edit → regenerate → approve →
  confirm Plan page's day-view slots reflect the new plan.
