# Goal-Driven Workout AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `goalFocus` (already in `profiles.lifestyle`) a first-class, editable primary health goal that drives AI workout generation and reorders Insights around it, add a `fitnessLevel` capability signal, and re-expose the existing "approve AI plan → push to Plan page day-view slots" flow from the Goals page.

**Architecture:** Extend the existing `LifestyleAnswers` type and `buildPrompt` (in `lib/ai/openrouter.ts`) with `fitnessLevel` + goal-focus-aware guidance — no new AI call shape, no schema migration. Add a small pure-logic module (`lib/burnlog/insightsGoal.ts`) that reorders Insights tabs by `goalFocus`, and a pure seeding module (`lib/burnlog/goalDefaults.ts`) that fills in missing `fitness_goals` numeric targets when a goal focus is set. Add two new Goals-page components that edit `profiles.lifestyle` directly and reuse the existing `PlanPreview` → `workout_plans` upsert path unchanged.

**Tech Stack:** Next.js App Router, React client components, Supabase (Postgres + JS client), Vitest, existing `shadcn/ui` components.

**Spec:** `docs/superpowers/specs/2026-09-07-goal-driven-workout-ai-design.md`

## Global Constraints

- `fitness_goals` table/schema is never migrated or restructured — only ever inserted into (seeding), never altered. Rings, benchmarks, cron jobs, reminders that read it are untouched.
- No new AI API routes or response shapes — `POST /api/ai/workout-plan` and its `WorkoutPlanEntry[]` output are reused as-is.
- No new somatotype/body-type question — capability signal is `fitnessLevel` (beginner/intermediate/advanced) + existing `injuries` text + existing height/weight, per the approved spec.
- Insights dynamism is rule-based only in this plan — no new AI calls.
- `BODY_PARTS`, `EXERCISES`, `buildWorkoutExercises`, `detectExcludedBodyParts`, `enforceExclusions` are unchanged — only more signal goes into the same prompt-building function.

---

## Task 1: `fitnessLevel` type + shared goal/fitness-level option lists

**Files:**
- Modify: `lib/ai/types.ts:166-186` (the `LifestyleAnswers` type block)

**Interfaces:**
- Produces: `export type GoalFocus`, `export type FitnessLevel`, `export const GOAL_FOCUS_OPTIONS: { value: GoalFocus; label: string }[]`, `export const FITNESS_LEVEL_OPTIONS: { value: FitnessLevel; label: string }[]`, and `LifestyleAnswers.fitnessLevel?: FitnessLevel`. Every later task imports these from `@/lib/ai/types`.

- [ ] **Step 1: Extract `GoalFocus` as a named type and add `FitnessLevel` + `fitnessLevel`**

In `lib/ai/types.ts`, replace:

```ts
export type LifestyleAnswers = {
  jobType: 'desk' | 'physical' | 'mixed' | 'not_working';
  hoursSitting: '<2' | '2-4' | '4-6' | '6-8' | '8+';
  commuteActivity: 'sedentary' | 'walk_or_bike';
  commuteDetails?: CommuteDetails;
  exerciseFrequency: 'none' | '1-2' | '3-4' | '5+';
  goalFocus:
    | 'lose_weight'
    | 'build_muscle'
    | 'improve_stamina'
    | 'general_health'
    | 'athletic_performance';
  injuries: string;
  preferredTrainingDays: number; // 3-6
  activityPreferences?: ActivityPreferences;
  equipment?: EquipmentAnswers;
  nutrition?: NutritionAnswers;
  grocery?: GroceryAnswers;
  mealPlanning?: MealPlanningAnswers;
};
```

with:

```ts
export type GoalFocus =
  | 'lose_weight'
  | 'build_muscle'
  | 'improve_stamina'
  | 'general_health'
  | 'athletic_performance';

export const GOAL_FOCUS_OPTIONS: { value: GoalFocus; label: string }[] = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'improve_stamina', label: 'Improve stamina' },
  { value: 'general_health', label: 'General health' },
  { value: 'athletic_performance', label: 'Athletic performance' },
];

/** Physical-capability signal used to tailor workout volume/complexity — see buildGoalFocusGuidance/buildFitnessLevelGuidance in lib/ai/openrouter.ts. */
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

export const FITNESS_LEVEL_OPTIONS: { value: FitnessLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner — new to structured training' },
  { value: 'intermediate', label: 'Intermediate — training consistently for 6+ months' },
  { value: 'advanced', label: 'Advanced — training consistently for 2+ years' },
];

export type LifestyleAnswers = {
  jobType: 'desk' | 'physical' | 'mixed' | 'not_working';
  hoursSitting: '<2' | '2-4' | '4-6' | '6-8' | '8+';
  commuteActivity: 'sedentary' | 'walk_or_bike';
  commuteDetails?: CommuteDetails;
  exerciseFrequency: 'none' | '1-2' | '3-4' | '5+';
  goalFocus: GoalFocus;
  /** Optional so existing saved profiles without it stay valid; buildPrompt defaults to 'intermediate'. */
  fitnessLevel?: FitnessLevel;
  injuries: string;
  preferredTrainingDays: number; // 3-6
  activityPreferences?: ActivityPreferences;
  equipment?: EquipmentAnswers;
  nutrition?: NutritionAnswers;
  grocery?: GroceryAnswers;
  mealPlanning?: MealPlanningAnswers;
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (existing `goalFocus: GoalFocus` is structurally identical to the old inline union, so every current caller still compiles).

- [ ] **Step 3: Commit**

```bash
git add lib/ai/types.ts
git commit -m "feat(burnlog): add fitnessLevel + shared goal-focus/fitness-level option lists"
```

---

## Task 2: Goal-focus- and fitness-level-aware workout prompt

**Files:**
- Modify: `lib/ai/openrouter.ts`
- Test: `lib/ai/openrouter.test.ts`

**Interfaces:**
- Consumes: `GoalFocus`, `FitnessLevel`, `LifestyleAnswers.fitnessLevel` from Task 1.
- Produces: nothing new consumed elsewhere — `buildPrompt`'s exported signature is unchanged, only its output string gains content.

- [ ] **Step 1: Write failing tests**

Append to `lib/ai/openrouter.test.ts`:

```ts
describe('buildPrompt — fitness level', () => {
  it('defaults to Intermediate when fitnessLevel is omitted', () => {
    const prompt = buildPrompt(profile, lifestyle);
    expect(prompt).toContain('Fitness level: Intermediate');
  });

  it('includes beginner guidance when fitnessLevel is beginner', () => {
    const prompt = buildPrompt(profile, { ...lifestyle, fitnessLevel: 'beginner' });
    expect(prompt).toContain('Fitness level: Beginner');
    expect(prompt).toContain('favor Full Body days over isolated splits even when the user trains at a gym');
  });

  it('includes advanced guidance when fitnessLevel is advanced', () => {
    const prompt = buildPrompt(profile, { ...lifestyle, fitnessLevel: 'advanced' });
    expect(prompt).toContain('gym-accessible split-style training (Push/Pull/Legs) is fully appropriate');
  });
});

describe('buildPrompt — goal focus guidance', () => {
  it('tells the model to prefer real splits for build_muscle at a gym', () => {
    const gymLifestyle: LifestyleAnswers = {
      ...lifestyle,
      goalFocus: 'build_muscle',
      equipment: { trainingLocation: 'commercial_gym', availableEquipment: ['Barbell', 'Dumbbells'] },
    };
    const prompt = buildPrompt(profile, gymLifestyle);
    expect(prompt).toContain('prefer true Push/Pull/Legs-style splits over generic Full Body days');
  });

  it('biases toward cardio for improve_stamina', () => {
    const prompt = buildPrompt(profile, { ...lifestyle, goalFocus: 'improve_stamina' });
    expect(prompt).toContain('bias the weekly schedule toward Cardio, Outdoor Cardio, and Full Body days');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/openrouter.test.ts`
Expected: FAIL — `Fitness level:` and the goal-focus guidance strings aren't in the prompt yet.

- [ ] **Step 3: Implement the guidance functions and wire them into `buildPrompt`**

In `lib/ai/openrouter.ts`, update the import line:

```ts
import { BODY_PARTS, type BodyPart, type FitnessLevel, type LifestyleAnswers, type WorkoutPlanEntry } from './types';
```

Add, right after the existing `GOAL_FOCUS_LABEL` map (after the line `};` that closes it, before `function buildEnvironmentContext`):

```ts
const FITNESS_LEVEL_LABEL: Record<FitnessLevel, string> = {
  beginner: 'Beginner (new to structured training)',
  intermediate: 'Intermediate (consistent training for 6+ months)',
  advanced: 'Advanced (consistent training for 2+ years)',
};
```

Add, right after the closing brace of `buildWorkoutTypeGuidance` (before the `// Keyword -> bodyPart(s) map` comment):

```ts
/** Extra prompt guidance keyed off the user's primary goal — layered on top of buildWorkoutTypeGuidance's environment-based rules, never overriding the Push/Pull/Legs gym gate. */
function buildGoalFocusGuidance(lifestyle: LifestyleAnswers): string {
  const loc = lifestyle.equipment?.trainingLocation ?? 'mixed';
  const gymAvailable = loc === 'commercial_gym' || loc === 'home_gym' || loc === 'mixed';
  switch (lifestyle.goalFocus) {
    case 'build_muscle':
      return gymAvailable
        ? 'Goal is building muscle: favor higher-frequency resistance training. If the user trains at a gym, prefer true Push/Pull/Legs-style splits over generic Full Body days to maximize weekly volume per muscle group.'
        : 'Goal is building muscle: favor higher-frequency resistance-style Bodyweight or Full Body days (e.g. progressive calisthenics) since the user does not have gym access.';
    case 'improve_stamina':
      return 'Goal is improving stamina: bias the weekly schedule toward Cardio, Outdoor Cardio, and Full Body days over isolated strength splits.';
    case 'athletic_performance':
      return 'Goal is athletic performance: bias toward Full Body and Cardio days that build functional, multi-joint strength and conditioning over isolated splits.';
    case 'lose_weight':
      return 'Goal is losing weight: favor a Full Body + Cardio mix that maximizes calorie burn per session over isolated splits.';
    case 'general_health':
    default:
      return 'Goal is general health: use a balanced mix of the available workout types.';
  }
}

/** Extra prompt guidance keyed off training experience — defaults to intermediate (no extra guidance) when unset. */
function buildFitnessLevelGuidance(fitnessLevel: FitnessLevel | undefined): string {
  switch (fitnessLevel ?? 'intermediate') {
    case 'beginner':
      return 'Fitness level is beginner: favor Full Body days over isolated splits even when the user trains at a gym, and use the lower end of their preferred training days for non-Rest days.';
    case 'advanced':
      return 'Fitness level is advanced: gym-accessible split-style training (Push/Pull/Legs) is fully appropriate if it otherwise fits the goal and environment guidance above.';
    case 'intermediate':
    default:
      return '';
  }
}
```

In `buildPrompt`, change:

```ts
export function buildPrompt(profile: ProfileContext, lifestyle: LifestyleAnswers, customInstructions?: string): string {
  const restDays = 7 - lifestyle.preferredTrainingDays;
  const environmentContext = buildEnvironmentContext(lifestyle);
  const commuteContext = buildCommuteContext(lifestyle);
  const typeGuidance = buildWorkoutTypeGuidance(lifestyle);
  const excludedBodyParts = detectExcludedBodyParts(lifestyle.injuries, customInstructions);
```

to:

```ts
export function buildPrompt(profile: ProfileContext, lifestyle: LifestyleAnswers, customInstructions?: string): string {
  const restDays = 7 - lifestyle.preferredTrainingDays;
  const environmentContext = buildEnvironmentContext(lifestyle);
  const commuteContext = buildCommuteContext(lifestyle);
  const typeGuidance = buildWorkoutTypeGuidance(lifestyle);
  const goalFocusGuidance = buildGoalFocusGuidance(lifestyle);
  const fitnessLevelGuidance = buildFitnessLevelGuidance(lifestyle.fitnessLevel);
  const excludedBodyParts = detectExcludedBodyParts(lifestyle.injuries, customInstructions);
```

Then change:

```ts
- Current exercise frequency: ${EXERCISE_FREQUENCY_LABEL[lifestyle.exerciseFrequency]}
- Primary goal: ${GOAL_FOCUS_LABEL[lifestyle.goalFocus]}
- Injuries or limitations: ${lifestyle.injuries || 'None reported'}
```

to:

```ts
- Current exercise frequency: ${EXERCISE_FREQUENCY_LABEL[lifestyle.exerciseFrequency]}
- Primary goal: ${GOAL_FOCUS_LABEL[lifestyle.goalFocus]}
- Fitness level: ${FITNESS_LEVEL_LABEL[lifestyle.fitnessLevel ?? 'intermediate']}
- Injuries or limitations: ${lifestyle.injuries || 'None reported'}
```

And change:

```ts
IMPORTANT — workout type selection rules:
${typeGuidance}
```

to:

```ts
IMPORTANT — workout type selection rules:
${typeGuidance} ${goalFocusGuidance}${fitnessLevelGuidance ? ` ${fitnessLevelGuidance}` : ''}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ai/openrouter.test.ts`
Expected: PASS, all tests including the pre-existing `customInstructions` ones.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/openrouter.ts lib/ai/openrouter.test.ts
git commit -m "feat(burnlog): make workout-plan prompt goal-focus and fitness-level aware"
```

---

## Task 3: Fitness-goal default-seeding helper

**Files:**
- Create: `lib/burnlog/goalDefaults.ts`
- Test: `lib/burnlog/goalDefaults.test.ts`

**Interfaces:**
- Consumes: `GoalFocus` from Task 1; `FitnessGoal` type from `lib/burnlog/queries.ts` (`{ id: string; goalType: string; targetValue: number }`).
- Produces: `export function seedGoalsForFocus(goalFocus: GoalFocus, existingGoalTypes: string[]): { goalType: string; targetValue: number }[]` (pure, used by Task 7) and `export async function seedMissingFitnessGoals(supabase: SupabaseClient, profileId: string, goalFocus: GoalFocus, existingGoalTypes: string[]): Promise<FitnessGoal[]>` (throws on Supabase error, returns the inserted rows — used by Task 7).

- [ ] **Step 1: Write the failing test**

Create `lib/burnlog/goalDefaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedGoalsForFocus } from './goalDefaults';

describe('seedGoalsForFocus', () => {
  it('returns calories_burned for lose_weight when absent', () => {
    expect(seedGoalsForFocus('lose_weight', [])).toEqual([{ goalType: 'calories_burned', targetValue: 900 }]);
  });

  it('filters out goal types the user already has', () => {
    expect(seedGoalsForFocus('lose_weight', ['calories_burned'])).toEqual([]);
  });

  it('returns both workout_frequency and workout_time for build_muscle', () => {
    expect(seedGoalsForFocus('build_muscle', [])).toEqual([
      { goalType: 'workout_frequency', targetValue: 4 },
      { goalType: 'workout_time', targetValue: 45 },
    ]);
  });

  it('only fills in the missing one when the user already has one of the two', () => {
    expect(seedGoalsForFocus('build_muscle', ['workout_time'])).toEqual([
      { goalType: 'workout_frequency', targetValue: 4 },
    ]);
  });

  it('returns daily_steps for general_health and improve_stamina', () => {
    expect(seedGoalsForFocus('general_health', [])).toEqual([{ goalType: 'daily_steps', targetValue: 8000 }]);
    expect(seedGoalsForFocus('improve_stamina', [])).toEqual([{ goalType: 'daily_steps', targetValue: 10000 }]);
  });

  it('returns workout_frequency and daily_steps for athletic_performance', () => {
    expect(seedGoalsForFocus('athletic_performance', [])).toEqual([
      { goalType: 'workout_frequency', targetValue: 5 },
      { goalType: 'daily_steps', targetValue: 10000 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/burnlog/goalDefaults.test.ts`
Expected: FAIL — `./goalDefaults` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `lib/burnlog/goalDefaults.ts`:

```ts
// lib/burnlog/goalDefaults.ts
//
// Seeds sensible fitness_goals numeric targets when a user sets/changes
// their primary goalFocus, so dashboard rings and benchmarks have a
// target without the user re-entering one. Never overwrites a goalType
// the user already has a value for — see seedGoalsForFocus's filter.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalFocus } from '@/lib/ai/types';
import type { FitnessGoal } from '@/lib/burnlog/queries';

type SeedGoal = { goalType: string; targetValue: number };

const GOAL_FOCUS_SEED_GOALS: Record<GoalFocus, SeedGoal[]> = {
  lose_weight: [{ goalType: 'calories_burned', targetValue: 900 }],
  build_muscle: [
    { goalType: 'workout_frequency', targetValue: 4 },
    { goalType: 'workout_time', targetValue: 45 },
  ],
  improve_stamina: [{ goalType: 'daily_steps', targetValue: 10000 }],
  general_health: [{ goalType: 'daily_steps', targetValue: 8000 }],
  athletic_performance: [
    { goalType: 'workout_frequency', targetValue: 5 },
    { goalType: 'daily_steps', targetValue: 10000 },
  ],
};

/** Pure: which of goalFocus's default targets the user doesn't already have a fitness_goals row for. */
export function seedGoalsForFocus(goalFocus: GoalFocus, existingGoalTypes: string[]): SeedGoal[] {
  const candidates = GOAL_FOCUS_SEED_GOALS[goalFocus] ?? [];
  return candidates.filter((c) => !existingGoalTypes.includes(c.goalType));
}

/** Inserts only the missing default goals for goalFocus and returns the inserted rows (empty array if none were missing). Throws on a Supabase error. */
export async function seedMissingFitnessGoals(
  supabase: SupabaseClient,
  profileId: string,
  goalFocus: GoalFocus,
  existingGoalTypes: string[]
): Promise<FitnessGoal[]> {
  const toSeed = seedGoalsForFocus(goalFocus, existingGoalTypes);
  if (toSeed.length === 0) return [];
  const rows = toSeed.map((g) => ({ profileId, goalType: g.goalType, targetValue: g.targetValue }));
  const { data, error } = await supabase.from('fitness_goals').insert(rows).select();
  if (error) throw error;
  return (data as FitnessGoal[]) ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/burnlog/goalDefaults.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/burnlog/goalDefaults.ts lib/burnlog/goalDefaults.test.ts
git commit -m "feat(burnlog): seed default fitness_goals targets from primary goal focus"
```

---

## Task 4: `fitnessLevel` field in the onboarding lifestyle form

**Files:**
- Modify: `app/(burnlog)/burnlog/ai-setup/_components/LifestyleForm.tsx`

**Interfaces:**
- Consumes: `FitnessLevel`, `GOAL_FOCUS_OPTIONS`, `FITNESS_LEVEL_OPTIONS` from Task 1.

- [ ] **Step 1: Add fitnessLevel state, a Select for it, and swap the hardcoded goal-focus options for the shared list**

In `app/(burnlog)/burnlog/ai-setup/_components/LifestyleForm.tsx`, change the import line:

```ts
import type { LifestyleAnswers, CommuteDetails } from '@/lib/ai/types';
```

to:

```ts
import { GOAL_FOCUS_OPTIONS, FITNESS_LEVEL_OPTIONS, type LifestyleAnswers, type FitnessLevel, type CommuteDetails } from '@/lib/ai/types';
```

Add a new state declaration right after the existing `goalFocus` state line:

```ts
  const [goalFocus, setGoalFocus] = useState<LifestyleAnswers['goalFocus']>(initialAnswers?.goalFocus ?? 'general_health');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(initialAnswers?.fitnessLevel ?? 'intermediate');
```

Add `fitnessLevel` to the `onSubmit` call inside `handleSubmit`:

```ts
    onSubmit({
      jobType,
      hoursSitting,
      commuteActivity: isActiveCommuter ? 'walk_or_bike' : 'sedentary',
      commuteDetails,
      exerciseFrequency,
      goalFocus,
      fitnessLevel,
      injuries,
      preferredTrainingDays,
    });
```

Replace the goal-focus `SelectContent` block:

```tsx
              <SelectContent>
                <SelectItem value="lose_weight">Lose weight</SelectItem>
                <SelectItem value="build_muscle">Build muscle</SelectItem>
                <SelectItem value="improve_stamina">Improve stamina</SelectItem>
                <SelectItem value="general_health">General health</SelectItem>
                <SelectItem value="athletic_performance">Athletic performance</SelectItem>
              </SelectContent>
```

with:

```tsx
              <SelectContent>
                {GOAL_FOCUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
```

Then add a new field right after the "Primary goal" `<div className="space-y-2">...</div>` block and before the "Injuries or physical limitations" block:

```tsx
          <div className="space-y-2">
            <Label>Fitness level</Label>
            <Select value={fitnessLevel} onValueChange={(v) => setFitnessLevel(v as FitnessLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FITNESS_LEVEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `/burnlog/ai-setup` (or trigger re-onboarding from a test profile), and confirm:
- The "Fitness level" select appears between "Primary goal" and "Injuries or physical limitations" with Beginner/Intermediate/Advanced options, defaulting to Intermediate.
- Submitting the form and completing the flow saves without error (check the Network tab: the `POST /api/ai/workout-plan` body includes `"fitnessLevel"`).

- [ ] **Step 4: Commit**

```bash
git add app/\(burnlog\)/burnlog/ai-setup/_components/LifestyleForm.tsx
git commit -m "feat(burnlog): capture fitness level in the AI-setup lifestyle form"
```

---

## Task 5: Pure goal-aware Insights logic

**Files:**
- Create: `lib/burnlog/insightsGoal.ts`
- Test: `lib/burnlog/insightsGoal.test.ts`

**Interfaces:**
- Consumes: `GoalFocus` from Task 1.
- Produces: `export type MetricKey = 'weight' | 'calories' | 'food' | 'stamina'`, `export function orderMetricsByGoalFocus(goalFocus: GoalFocus | null | undefined): MetricKey[]`, `export function goalTypeForMetric(metric: MetricKey): string | null`, `export function averageValue(chartData: Array<{ [key: string]: unknown }>, valueKey: string): number`, `export function calculateGoalStatus(average: number, target: number, unit: string): string` — all consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `lib/burnlog/insightsGoal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { orderMetricsByGoalFocus, goalTypeForMetric, averageValue, calculateGoalStatus } from './insightsGoal';

describe('orderMetricsByGoalFocus', () => {
  it('leads with weight for lose_weight and general_health', () => {
    expect(orderMetricsByGoalFocus('lose_weight')[0]).toBe('weight');
    expect(orderMetricsByGoalFocus('general_health')[0]).toBe('weight');
  });

  it('leads with calories for build_muscle', () => {
    expect(orderMetricsByGoalFocus('build_muscle')[0]).toBe('calories');
  });

  it('leads with stamina for improve_stamina and athletic_performance', () => {
    expect(orderMetricsByGoalFocus('improve_stamina')[0]).toBe('stamina');
    expect(orderMetricsByGoalFocus('athletic_performance')[0]).toBe('stamina');
  });

  it('falls back to the default order when goalFocus is null or undefined', () => {
    expect(orderMetricsByGoalFocus(null)).toEqual(['weight', 'calories', 'food', 'stamina']);
    expect(orderMetricsByGoalFocus(undefined)).toEqual(['weight', 'calories', 'food', 'stamina']);
  });

  it('keeps every metric exactly once, leading metric moved to front', () => {
    const result = orderMetricsByGoalFocus('build_muscle');
    expect(result).toEqual(['calories', 'weight', 'food', 'stamina']);
  });
});

describe('goalTypeForMetric', () => {
  it('maps calories to calories_burned and stamina to workout_time', () => {
    expect(goalTypeForMetric('calories')).toBe('calories_burned');
    expect(goalTypeForMetric('stamina')).toBe('workout_time');
  });

  it('returns null for weight and food (handled separately / no mapping)', () => {
    expect(goalTypeForMetric('weight')).toBeNull();
    expect(goalTypeForMetric('food')).toBeNull();
  });
});

describe('averageValue', () => {
  it('returns 0 for an empty array', () => {
    expect(averageValue([], 'duration')).toBe(0);
  });

  it('averages the given key across entries', () => {
    expect(averageValue([{ duration: 30 }, { duration: 60 }], 'duration')).toBe(45);
  });
});

describe('calculateGoalStatus', () => {
  it('reports on track within 5% of target', () => {
    expect(calculateGoalStatus(46, 45, 'min')).toContain('On track');
  });

  it('reports above target when average exceeds it by more than 5%', () => {
    expect(calculateGoalStatus(60, 45, 'min')).toContain('above your 45 min goal');
  });

  it('reports below target when average is under it by more than 5%', () => {
    expect(calculateGoalStatus(20, 45, 'min')).toContain('below your 45 min goal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/burnlog/insightsGoal.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/burnlog/insightsGoal.ts`:

```ts
// lib/burnlog/insightsGoal.ts
//
// Pure, testable logic for making BurnLog's Insights page goal-aware:
// which metric tab leads (orderMetricsByGoalFocus) and whether the
// leading metric has a fitness_goals target to report progress against
// (goalTypeForMetric + calculateGoalStatus). Kept separate from
// InsightsClient.tsx so it's unit-testable without rendering React.
import type { GoalFocus } from '@/lib/ai/types';

export type MetricKey = 'weight' | 'calories' | 'food' | 'stamina';

export const DEFAULT_METRIC_ORDER: MetricKey[] = ['weight', 'calories', 'food', 'stamina'];

const LEADING_METRIC_BY_GOAL_FOCUS: Record<GoalFocus, MetricKey> = {
  lose_weight: 'weight',
  build_muscle: 'calories',
  improve_stamina: 'stamina',
  athletic_performance: 'stamina',
  general_health: 'weight',
};

/** Reorders the metric tabs so the one matching the user's active goalFocus leads; falls back to the default order when goalFocus is unset. */
export function orderMetricsByGoalFocus(goalFocus: GoalFocus | null | undefined): MetricKey[] {
  const leading = goalFocus ? LEADING_METRIC_BY_GOAL_FOCUS[goalFocus] : undefined;
  if (!leading) return DEFAULT_METRIC_ORDER;
  return [leading, ...DEFAULT_METRIC_ORDER.filter((m) => m !== leading)];
}

const GOAL_TYPE_BY_METRIC: Record<MetricKey, string | null> = {
  weight: null, // weight already gets its own forecast-based line against the weight_loss goal
  calories: 'calories_burned',
  food: null,
  stamina: 'workout_time',
};

/** Which fitness_goals `goalType` (if any) a metric's progress line should compare against. */
export function goalTypeForMetric(metric: MetricKey): string | null {
  return GOAL_TYPE_BY_METRIC[metric];
}

export function averageValue(chartData: Array<{ [key: string]: unknown }>, valueKey: string): number {
  if (chartData.length === 0) return 0;
  const sum = chartData.reduce((acc, d) => acc + (Number(d[valueKey]) || 0), 0);
  return sum / chartData.length;
}

/** A short "averaging X vs your Y goal" status line for a metric's leading-tab goal-progress display. */
export function calculateGoalStatus(average: number, target: number, unit: string): string {
  const diffPct = target === 0 ? 0 : ((average - target) / target) * 100;
  if (Math.abs(diffPct) < 5) {
    return `On track — averaging ${average.toFixed(0)} ${unit} vs your ${target} ${unit} goal`;
  }
  if (average > target) {
    return `Averaging ${average.toFixed(0)} ${unit}, above your ${target} ${unit} goal`;
  }
  return `Averaging ${average.toFixed(0)} ${unit}, below your ${target} ${unit} goal`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/burnlog/insightsGoal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/burnlog/insightsGoal.ts lib/burnlog/insightsGoal.test.ts
git commit -m "feat(burnlog): add pure goal-aware Insights ordering/progress logic"
```

---

## Task 6: Wire goal-aware ordering into Insights

**Files:**
- Modify: `app/(burnlog)/burnlog/insights/page.tsx`
- Modify: `app/(burnlog)/burnlog/insights/_components/InsightsClient.tsx`

**Interfaces:**
- Consumes: `orderMetricsByGoalFocus`, `goalTypeForMetric`, `averageValue`, `calculateGoalStatus`, `type MetricKey` from Task 5; `type GoalFocus` from Task 1.

- [ ] **Step 1: Fetch `lifestyle` and the full `fitness_goals` list in the server page**

In `app/(burnlog)/burnlog/insights/page.tsx`, change the profile select:

```ts
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('userId', user.id)
    .single();
```

to:

```ts
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, lifestyle')
    .eq('userId', user.id)
    .single();
```

Change the parallel fetch:

```ts
  const [
    { data: weightEntries = [] },
    { data: weightGoal = null },
    { data: calorieBurns = [] },
    { data: foodIntakes = [] },
    { data: staminaSessions = [] },
  ] = await Promise.all([
    supabase
      .from('weight_entries')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('fitness_goals')
      .select('*')
      .eq('profileId', profileId)
      .eq('goalType', 'weight_loss')
      .order('createdAt', { ascending: false })
      .single(),
    supabase
      .from('calorie_burns')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('food_intakes')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('stamina_sessions')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
  ]);
```

to:

```ts
  const [
    { data: weightEntries = [] },
    { data: fitnessGoals = [] },
    { data: calorieBurns = [] },
    { data: foodIntakes = [] },
    { data: staminaSessions = [] },
  ] = await Promise.all([
    supabase
      .from('weight_entries')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('fitness_goals')
      .select('*')
      .eq('profileId', profileId),
    supabase
      .from('calorie_burns')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('food_intakes')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
    supabase
      .from('stamina_sessions')
      .select('*')
      .eq('profileId', profileId)
      .order('date', { ascending: true }),
  ]);

  const weightGoal = (fitnessGoals ?? []).find((g) => g.goalType === 'weight_loss') ?? null;
  const goalFocus =
    ((profile.lifestyle as { goalFocus?: GoalFocus } | null)?.goalFocus as GoalFocus | undefined) ?? null;
```

Add the import at the top of the file, alongside the other imports:

```ts
import type { GoalFocus } from '@/lib/ai/types';
```

And pass the two new props to `InsightsClient`:

```tsx
          <InsightsClient
            weightEntries={weightEntries || []}
            weightGoal={weightGoal}
            calorieBurns={calorieBurns || []}
            foodIntakes={foodIntakes || []}
            staminaSessions={staminaSessions || []}
            goalFocus={goalFocus}
            fitnessGoals={fitnessGoals || []}
          />
```

- [ ] **Step 2: Accept the new props and swap in `orderMetricsByGoalFocus` for the fixed tab list**

In `app/(burnlog)/burnlog/insights/_components/InsightsClient.tsx`, update the imports:

```ts
import { Scale, Flame, Utensils, Heart, HeartPulse, TrendingUp, Zap, Repeat, BarChart3, Users } from 'lucide-react';
```

to:

```ts
import { Scale, Flame, Utensils, Heart, HeartPulse, TrendingUp, Zap, Repeat, BarChart3, Users } from 'lucide-react';
import type { GoalFocus } from '@/lib/ai/types';
import { orderMetricsByGoalFocus, goalTypeForMetric, averageValue, calculateGoalStatus, type MetricKey } from '@/lib/burnlog/insightsGoal';
```

Remove the now-duplicate local type alias:

```ts
type MetricKey = 'weight' | 'calories' | 'food' | 'stamina';
```

(delete this line — `MetricKey` now comes from the import above).

Update `InsightsClientProps`:

```ts
interface InsightsClientProps {
  weightEntries: WeightEntry[];
  weightGoal: Goal | null;
  calorieBurns: CalorieBurn[];
  foodIntakes: FoodIntake[];
  staminaSessions: StaminaSession[];
}
```

to:

```ts
interface InsightsClientProps {
  weightEntries: WeightEntry[];
  weightGoal: Goal | null;
  calorieBurns: CalorieBurn[];
  foodIntakes: FoodIntake[];
  staminaSessions: StaminaSession[];
  goalFocus: GoalFocus | null;
  fitnessGoals: { goalType: string; targetValue: number }[];
}
```

Update `MetricSlide`'s signature to accept and render a goal-progress line:

```ts
function MetricSlide({
  metric,
  chartData,
  weightGoal,
}: {
  metric: MetricKey;
  chartData: Array<{ date: string; [key: string]: any }>;
  weightGoal: Goal | null;
}) {
```

to:

```ts
function MetricSlide({
  metric,
  chartData,
  weightGoal,
  goalStatus,
}: {
  metric: MetricKey;
  chartData: Array<{ date: string; [key: string]: any }>;
  weightGoal: Goal | null;
  goalStatus: string | null;
}) {
```

And in its JSX, change:

```tsx
          <CardContent className="pt-0">
            <p className="text-sm">{trend.trend}</p>
            {metric === 'weight' && weightGoal && <p className="text-xs text-muted-foreground mt-1">{forecast}</p>}
          </CardContent>
```

to:

```tsx
          <CardContent className="pt-0">
            <p className="text-sm">{trend.trend}</p>
            {metric === 'weight' && weightGoal && <p className="text-xs text-muted-foreground mt-1">{forecast}</p>}
            {goalStatus && <p className="text-xs text-muted-foreground mt-1">{goalStatus}</p>}
          </CardContent>
```

- [ ] **Step 3: Compute ordered metrics, tabs, and per-metric goal status in the main component**

Update the component signature:

```ts
export default function InsightsClient({
  weightEntries,
  weightGoal,
  calorieBurns,
  foodIntakes,
  staminaSessions,
}: InsightsClientProps) {
```

to:

```ts
export default function InsightsClient({
  weightEntries,
  weightGoal,
  calorieBurns,
  foodIntakes,
  staminaSessions,
  goalFocus,
  fitnessGoals,
}: InsightsClientProps) {
```

Remove the module-level `insightTabs` constant and the `const tabFromUrl = insightTabs.findIndex(...)` line's dependency on it — replace the whole block from the `insightTabs`/`METRICS` module-level constants down through `dataByMetric` as follows.

Replace:

```ts
const insightTabs: TabItem[] = [
  { id: 'weight', icon: Scale, label: 'Weight', color: 'var(--chart-1)' },
  { id: 'calories', icon: Flame, label: 'Calories', color: 'var(--chart-2)' },
  { id: 'food', icon: Utensils, label: 'Food', color: 'var(--chart-3)' },
  { id: 'stamina', icon: HeartPulse, label: 'Stamina', color: 'var(--chart-4)' },
  { id: 'benchmark', icon: Users, label: 'Benchmarks', color: 'var(--chart-5)' },
];

const METRICS: MetricKey[] = ['weight', 'calories', 'food', 'stamina'];
```

with:

```ts
const METRIC_TAB_META: Record<MetricKey, TabItem> = {
  weight: { id: 'weight', icon: Scale, label: 'Weight', color: 'var(--chart-1)' },
  calories: { id: 'calories', icon: Flame, label: 'Calories', color: 'var(--chart-2)' },
  food: { id: 'food', icon: Utensils, label: 'Food', color: 'var(--chart-3)' },
  stamina: { id: 'stamina', icon: HeartPulse, label: 'Stamina', color: 'var(--chart-4)' },
};

const BENCHMARK_TAB: TabItem = { id: 'benchmark', icon: Users, label: 'Benchmarks', color: 'var(--chart-5)' };

const METRICS: MetricKey[] = ['weight', 'calories', 'food', 'stamina'];
```

Inside the component, right after the `const tabFromUrl = ...` / `const [selectedIndex, ...]` / `const setSelectedIndex = ...` block (which stays as-is — `insightTabs` used there is now computed below, so move this block after the new `useMemo` or just reference the memoized `insightTabs` — see note), add:

```ts
  const orderedMetrics = useMemo(() => orderMetricsByGoalFocus(goalFocus), [goalFocus]);
  const insightTabs: TabItem[] = useMemo(
    () => [...orderedMetrics.map((m) => METRIC_TAB_META[m]), BENCHMARK_TAB],
    [orderedMetrics]
  );
```

Place this `useMemo` block **before** the existing `const tabFromUrl = insightTabs.findIndex(...)` line (move it up if necessary) so `insightTabs` is defined before it's used.

Then, after the existing `const dataByMetric: Record<MetricKey, ...> = { ... };` block, add:

```ts
  const goalStatusByMetric = useMemo(() => {
    const result: Partial<Record<MetricKey, string | null>> = {};
    const leadingMetric = orderedMetrics[0];
    for (const metric of METRICS) {
      if (metric !== leadingMetric || metric === 'weight') {
        result[metric] = null;
        continue;
      }
      const goalType = goalTypeForMetric(metric);
      const target = goalType ? fitnessGoals.find((g) => g.goalType === goalType)?.targetValue : undefined;
      const data = dataByMetric[metric];
      if (!goalType || !target || data.length === 0) {
        result[metric] = null;
        continue;
      }
      const avg = averageValue(data, METRIC_META[metric].dataKey);
      result[metric] = calculateGoalStatus(avg, target, METRIC_META[metric].unit);
    }
    return result;
  }, [orderedMetrics, fitnessGoals, dataByMetric]);
```

Finally, update the slides array. Change:

```tsx
        slides={[
          ...METRICS.map((metric) => (
            <MetricSlide key={metric} metric={metric} chartData={dataByMetric[metric]} weightGoal={weightGoal} />
          )),
```

to:

```tsx
        slides={[
          ...orderedMetrics.map((metric) => (
            <MetricSlide
              key={metric}
              metric={metric}
              chartData={dataByMetric[metric]}
              weightGoal={weightGoal}
              goalStatus={goalStatusByMetric[metric] ?? null}
            />
          )),
```

(the `<Card key="benchmark">...` slide right after stays unchanged).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, visit `/burnlog/insights` for a profile with `lifestyle.goalFocus = 'improve_stamina'` (or temporarily set one via Supabase Studio) and confirm the Stamina tab is now first/selected-by-default over Weight, and that setting `goalFocus` to `build_muscle` with a `workout_time` fitness_goals row set shows a goal-status line under the Calories tab's Trend card.

- [ ] **Step 6: Commit**

```bash
git add app/\(burnlog\)/burnlog/insights/page.tsx app/\(burnlog\)/burnlog/insights/_components/InsightsClient.tsx
git commit -m "feat(burnlog): reorder Insights tabs and surface goal progress by goal focus"
```

---

## Task 7: `GoalFocusCard` — edit primary goal + fitness level on the Goals page

**Files:**
- Create: `app/(burnlog)/burnlog/goals/_components/GoalFocusCard.tsx`

**Interfaces:**
- Consumes: `GOAL_FOCUS_OPTIONS`, `FITNESS_LEVEL_OPTIONS`, `type GoalFocus`, `type FitnessLevel`, `type LifestyleAnswers` from Task 1; `seedMissingFitnessGoals` from Task 3; `type FitnessGoal` from `lib/burnlog/queries.ts`; `refreshCurrentProfile` from `lib/useCurrentProfile.ts`.
- Produces: `export function GoalFocusCard(props: { profileId: string; lifestyle: LifestyleAnswers | null; existingGoalTypes: string[]; onGoalsSeeded: (newGoals: FitnessGoal[]) => void })` — consumed by Task 9.

- [ ] **Step 1: Implement the component**

Create `app/(burnlog)/burnlog/goals/_components/GoalFocusCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil } from 'lucide-react';
import {
  GOAL_FOCUS_OPTIONS,
  FITNESS_LEVEL_OPTIONS,
  type GoalFocus,
  type FitnessLevel,
  type LifestyleAnswers,
} from '@/lib/ai/types';
import { seedMissingFitnessGoals } from '@/lib/burnlog/goalDefaults';
import { refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import type { FitnessGoal } from '@/lib/burnlog/queries';

type GoalFocusCardProps = {
  profileId: string;
  lifestyle: LifestyleAnswers | null;
  existingGoalTypes: string[];
  onGoalsSeeded: (newGoals: FitnessGoal[]) => void;
};

export function GoalFocusCard({ profileId, lifestyle, existingGoalTypes, onGoalsSeeded }: GoalFocusCardProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [goalFocus, setGoalFocus] = useState<GoalFocus>(lifestyle?.goalFocus ?? 'general_health');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(lifestyle?.fitnessLevel ?? 'intermediate');
  const [saving, setSaving] = useState(false);

  if (!lifestyle) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set your health goal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Complete AI setup to set a primary health goal — it drives your AI-generated workout plan and Insights.
          </p>
          <Button asChild>
            <Link href="/burnlog/ai-setup?returnTo=/burnlog/goals">Start AI setup</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const goalFocusLabel =
    GOAL_FOCUS_OPTIONS.find((o) => o.value === lifestyle.goalFocus)?.label ?? lifestyle.goalFocus;
  const fitnessLevelLabel =
    FITNESS_LEVEL_OPTIONS.find((o) => o.value === (lifestyle.fitnessLevel ?? 'intermediate'))?.label ?? 'Intermediate';

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedLifestyle: LifestyleAnswers = { ...lifestyle, goalFocus, fitnessLevel };
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ lifestyle: updatedLifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;

      const seeded = await seedMissingFitnessGoals(supabase, profileId, goalFocus, existingGoalTypes);
      await refreshCurrentProfile();
      if (seeded.length > 0) onGoalsSeeded(seeded);

      toast({
        title: 'Goal updated',
        description: `Now focused on: ${GOAL_FOCUS_OPTIONS.find((o) => o.value === goalFocus)?.label}`,
      });
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update your goal';
      toast({ title: 'Update failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Your goal</CardTitle>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Edit goal">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          <>
            <p className="text-sm">
              <span className="text-muted-foreground">Focus:</span> {goalFocusLabel}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Fitness level:</span> {fitnessLevelLabel}
            </p>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Primary goal</Label>
              <Select value={goalFocus} onValueChange={(v) => setGoalFocus(v as GoalFocus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_FOCUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fitness level</Label>
              <Select value={fitnessLevel} onValueChange={(v) => setFitnessLevel(v as FitnessLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FITNESS_LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(burnlog\)/burnlog/goals/_components/GoalFocusCard.tsx
git commit -m "feat(burnlog): add editable primary-goal card to the Goals page"
```

---

## Task 8: `RegeneratePlanCard` — AI-generate, approve, push to logbook day-view slots

**Files:**
- Create: `app/(burnlog)/burnlog/goals/_components/RegeneratePlanCard.tsx`

**Interfaces:**
- Consumes: `PlanPreview` (unchanged) from `app/(burnlog)/burnlog/ai-setup/_components/PlanPreview.tsx`; `type LifestyleAnswers`, `type WorkoutPlanEntry` from `lib/ai/types.ts`.
- Produces: `export function RegeneratePlanCard(props: { profileId: string; lifestyle: LifestyleAnswers })` — consumed by Task 9. On save, upserts `workout_plans` exactly like `AiSetupFlow.handleSave` does today, so the Plan page's existing day-view (`session/page.tsx`) picks it up with no changes there.

- [ ] **Step 1: Implement the component**

Create `app/(burnlog)/burnlog/goals/_components/RegeneratePlanCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlanPreview } from '@/app/(burnlog)/burnlog/ai-setup/_components/PlanPreview';
import { AiLoading } from '@/components/kokonutui/ai-loading';
import { useToast } from '@/components/ui/use-toast';
import type { LifestyleAnswers, WorkoutPlanEntry } from '@/lib/ai/types';

type RegeneratePlanCardProps = {
  profileId: string;
  lifestyle: LifestyleAnswers;
};

export function RegeneratePlanCard({ profileId, lifestyle }: RegeneratePlanCardProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<'idle' | 'generating' | 'preview'>('idle');
  const [plan, setPlan] = useState<WorkoutPlanEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPlan = async (customInstructions?: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/ai/workout-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customInstructions ? { ...lifestyle, customInstructions } : lifestyle),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate a plan');
      setPlan(body.plan as WorkoutPlanEntry[]);
      setStatus('preview');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate a plan';
      setError(message);
      toast({ title: 'Generation failed', description: message, variant: 'destructive' });
      setStatus('idle');
      return false;
    }
  };

  const handleGenerate = async () => {
    setStatus('generating');
    await requestPlan();
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    await requestPlan();
    setRegenerating(false);
  };

  const handleAskAi = async (customInstructions: string) => {
    setRegenerating(true);
    const ok = await requestPlan(customInstructions);
    setRegenerating(false);
    if (!ok) throw new Error('Failed to generate a plan');
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const rows = plan.map((entry) => ({
        profileId,
        dayOfWeek: entry.dayOfWeek,
        bodyPart: entry.bodyPart,
        repeatWeekly: true,
      }));
      const { error: planError } = await supabase
        .from('workout_plans')
        .upsert(rows, { onConflict: 'profileId,dayOfWeek' });
      if (planError) throw planError;
      toast({ title: 'Plan updated', description: "Your Plan page's daily slots now reflect this schedule." });
      setStatus('idle');
      setPlan(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save your plan';
      setError(message);
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'generating') {
    return (
      <Card>
        <CardContent className="py-8">
          <AiLoading
            tasks={['Analyzing your goal', 'Building your weekly split', 'Balancing recovery days', 'Finalizing your plan']}
          />
        </CardContent>
      </Card>
    );
  }

  if (status === 'preview' && plan) {
    return (
      <PlanPreview
        plan={plan}
        saving={saving}
        regenerating={regenerating}
        onChange={setPlan}
        onSave={handleSave}
        onRegenerate={handleRegenerate}
        onAskAi={handleAskAi}
        onCancel={() => {
          setStatus('idle');
          setPlan(null);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workout plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Regenerate your weekly workout schedule using your current goal, fitness level, and training environment.
          Approved changes are pushed straight to your Plan page&apos;s daily slots.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleGenerate}>Regenerate workout plan</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(burnlog\)/burnlog/goals/_components/RegeneratePlanCard.tsx
git commit -m "feat(burnlog): regenerate-and-approve workout plan flow on the Goals page"
```

---

## Task 9: Wire `GoalFocusCard` + `RegeneratePlanCard` into the Goals page

**Files:**
- Modify: `app/(burnlog)/burnlog/goals/page.tsx`

**Interfaces:**
- Consumes: `GoalFocusCard` from Task 7, `RegeneratePlanCard` from Task 8, `type LifestyleAnswers` from Task 1.

- [ ] **Step 1: Import the new components and derive `lifestyle`**

In `app/(burnlog)/burnlog/goals/page.tsx`, update imports:

```ts
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalsList } from './_components/GoalsList';
```

to:

```ts
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalsList } from './_components/GoalsList';
import { GoalFocusCard } from './_components/GoalFocusCard';
import { RegeneratePlanCard } from './_components/RegeneratePlanCard';
import type { LifestyleAnswers } from '@/lib/ai/types';
```

Right after the existing `const { profile, loading: profileLoading } = useCurrentProfile();` line, add:

```ts
  const lifestyle = (profile?.lifestyle as LifestyleAnswers | null) ?? null;
```

- [ ] **Step 2: Add a handler that appends seeded goals to the SWR cache**

Right after the existing `handleGoalAdded` function, add:

```ts
  const handleGoalsSeeded = (newGoals: Goal[]) => {
    mutateGoals([...goals, ...newGoals], { revalidate: false });
  };
```

- [ ] **Step 3: Render the two new cards at the top of the "goals-list" slide**

Change:

```tsx
            <div key="goals-list" className="space-y-4">
              {goals.length > 0 ? (
```

to:

```tsx
            <div key="goals-list" className="space-y-4">
              {profile && (
                <GoalFocusCard
                  profileId={profile.id}
                  lifestyle={lifestyle}
                  existingGoalTypes={goals.map((g) => g.goalType)}
                  onGoalsSeeded={handleGoalsSeeded}
                />
              )}
              {profile && lifestyle && <RegeneratePlanCard profileId={profile.id} lifestyle={lifestyle} />}
              {goals.length > 0 ? (
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, visit `/burnlog/goals`:
- For a profile that hasn't completed AI setup: the goal card shows "Set your health goal" with a link to `/burnlog/ai-setup`, and no `RegeneratePlanCard`.
- For a profile that has: the goal card shows current focus/fitness level, editing and saving updates them (check `profiles.lifestyle` in Supabase Studio), and any missing `fitness_goals` default rows for the new focus appear in the Goals list without duplicating ones you already had.
- Click "Regenerate workout plan" → generation runs → `PlanPreview` shows → "Save Plan" → navigate to `/burnlog/session` (the Plan page) and confirm the day-view slots (`WeekdayTabs`) reflect the newly saved plan.

- [ ] **Step 6: Commit**

```bash
git add app/\(burnlog\)/burnlog/goals/page.tsx
git commit -m "feat(burnlog): surface goal focus and workout-plan regeneration on Goals page"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** §1 (goal card + seeding) → Tasks 3, 7, 9. §2 (fitnessLevel capture) → Tasks 1, 4. §3 (goal/capability-aware prompt) → Task 2. §4 (dynamic Insights) → Tasks 5, 6. §5 (approve → logbook push, reused) → Task 8, verified in Task 9 Step 5. All five spec sections are covered.
- **Type consistency:** `GoalFocus`/`FitnessLevel` (Task 1) are the single source used by Tasks 2, 3, 5, 6, 7, 8 — no local redefinitions. `MetricKey` is defined once (Task 5) and imported everywhere it's used (Task 6), replacing the old local alias in `InsightsClient.tsx`. `seedMissingFitnessGoals`'s return type (`FitnessGoal[]`) matches `GoalFocusCard`'s `onGoalsSeeded` parameter type.
- **No placeholders:** every step has literal code, not descriptions of code.
