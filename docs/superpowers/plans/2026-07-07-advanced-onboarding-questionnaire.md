# Advanced Multi-Page Onboarding Questionnaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four admin-toggleable pages (Goals, Activity Preferences, Equipment &
Environment, Nutrition Habits) to the `/ai-setup` flow after the existing Lifestyle page, plus
an admin gear icon on Profile to turn each page on/off for everyone.

**Architecture:** One new table (`onboarding_page_flags`, admin-write/anyone-read) drives which
of four new step components appear in `AiSetupFlow`, in a fixed order, skipping disabled ones.
Goals data goes to the existing `fitness_goals` table; the other three pages extend the existing
`profiles.lifestyle` JSON blob with new optional keys. Nothing new is saved until the flow's
existing final "Save Plan" click - same invariant as today.

**Tech Stack:** Next.js App Router, Supabase JS client (direct table reads/writes, no new API
route), Prisma for schema only (`prisma db push` - RLS policies applied via raw SQL since this
repo has no `prisma/migrations` and Prisma doesn't manage RLS).

## Global Constraints

- `lib/ai/openrouter.ts`'s AI prompt is NOT modified in this plan - the four new pages' data is
  stored for future AI features to consume, not used by plan generation now.
- Disabled pages are never rendered - not shown-then-skippable.
- All four pages have both Continue and Skip - nothing is required.
- Nothing from the four new pages is written to the database until the existing final "Save
  Plan" action in `AiSetupFlow.tsx`.
- `tsc --noEmit` must stay clean after every task.

---

### Task 1: `onboarding_page_flags` table, RLS, and seed data

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `onboarding_page_flags` table with columns `id`, `pageKey` (unique text),
  `label`, `isEnabled` (boolean), `createdAt` - read by Task 3, written by Task 5.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Add at the end of the file (after the `StaminaSession` model):

```prisma
/// admin-toggleable onboarding page flags
model OnboardingPageFlag {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageKey   String   @unique
  label     String
  isEnabled Boolean  @default(true)
  createdAt DateTime @default(now())

  @@map("onboarding_page_flags")
}
```

- [ ] **Step 2: Push the schema change**

Run: `npx prisma db push`
Expected: confirms `onboarding_page_flags` table created, no errors.

- [ ] **Step 3: Enable RLS and add policies**

Run via SQL (e.g. `mcp__supabase__execute_sql` or `psql`, whichever this project's workflow
uses for the connected database):

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

Expected: both statements succeed with no errors.

- [ ] **Step 4: Seed the 4 rows**

Run via SQL:

```sql
insert into onboarding_page_flags (id, "pageKey", label, "isEnabled", "createdAt")
values
  (gen_random_uuid(), 'goals', 'Goals', true, now()),
  (gen_random_uuid(), 'activity_preferences', 'Activity Preferences', true, now()),
  (gen_random_uuid(), 'equipment', 'Equipment & Environment', true, now()),
  (gen_random_uuid(), 'nutrition', 'Nutrition Habits', true, now())
on conflict ("pageKey") do nothing;
```

- [ ] **Step 5: Verify**

Run via SQL: `select "pageKey", label, "isEnabled" from onboarding_page_flags order by "pageKey";`
Expected: exactly 4 rows, all `isEnabled = true`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
Add onboarding_page_flags table for admin-toggleable questionnaire pages

RLS: any authenticated user can read (the /ai-setup flow needs to know
which pages to show), only admins (profiles.isAdmin) can update.
Seeded with 4 rows, all enabled by default.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared types/constants + GOAL_TYPES refactor

**Files:**
- Modify: `lib/ai/types.ts`
- Create: `lib/goalTypes.ts`
- Modify: `app/goals/_components/AddGoalForm.tsx`

**Interfaces:**
- Produces: `ActivityPreferences`, `EquipmentAnswers`, `NutritionAnswers` types and
  `ACTIVITY_TYPES`, `EQUIPMENT_OPTIONS` constants from `lib/ai/types.ts`; `GOAL_TYPES` constant
  from `lib/goalTypes.ts` - all consumed by Task 3/4's step components.

- [ ] **Step 1: Extend `lib/ai/types.ts`**

Replace the full contents of `lib/ai/types.ts` with:

```ts
// lib/ai/types.ts

export const BODY_PARTS = ['Push', 'Pull', 'Legs', 'Full Body', 'Cardio', 'Rest'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export type WorkoutPlanEntry = {
  dayOfWeek: number; // 0=Sun ... 6=Sat
  bodyPart: BodyPart;
};

export const ACTIVITY_TYPES = ['Weights', 'Cardio', 'Sports', 'Yoga', 'HIIT', 'Swimming'] as const;

export const EQUIPMENT_OPTIONS = [
  'Dumbbells',
  'Barbell',
  'Resistance Bands',
  'Pull-up Bar',
  'Cardio Machine',
  'Kettlebell',
  'None',
] as const;

export type ActivityPreferences = {
  enjoyedTypes: string[];
  dislikedTypes: string[];
  environment: 'indoor' | 'outdoor' | 'either';
  social: 'solo' | 'group' | 'either';
};

export type EquipmentAnswers = {
  trainingLocation: 'commercial_gym' | 'home_gym' | 'bodyweight_only' | 'mixed';
  availableEquipment: string[];
};

export type NutritionAnswers = {
  dietStyle: 'none' | 'vegetarian' | 'vegan' | 'keto' | 'paleo' | 'other';
  mealsPerDay: number;
  restrictions: string;
};

export type LifestyleAnswers = {
  jobType: 'desk' | 'physical' | 'mixed' | 'not_working';
  hoursSitting: '<2' | '2-4' | '4-6' | '6-8' | '8+';
  commuteActivity: 'sedentary' | 'walk_or_bike';
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
};
```

- [ ] **Step 2: Create `lib/goalTypes.ts`**

```ts
// lib/goalTypes.ts

export const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss (kg)' },
  { value: 'weight_gain', label: 'Weight Gain (kg)' },
  { value: 'calories_burned', label: 'Daily Calories Burned (kcal)' },
  { value: 'running_distance', label: 'Running Distance (km)' },
  { value: 'workout_frequency', label: 'Weekly Workouts (count)' },
  { value: 'workout_time', label: 'Workout Duration (mins)' },
] as const;
```

- [ ] **Step 3: Refactor `AddGoalForm.tsx` to use the shared constant**

Find (near the top of `app/goals/_components/AddGoalForm.tsx`):

```ts
import { Loader } from 'lucide-react';

type AddGoalFormProps = {
  onGoalAdded: (goal: Goal) => void;
  userId: string;
};

const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss (kg)' },
  { value: 'weight_gain', label: 'Weight Gain (kg)' },
  { value: 'calories_burned', label: 'Daily Calories Burned (kcal)' },
  { value: 'running_distance', label: 'Running Distance (km)' },
  { value: 'workout_frequency', label: 'Weekly Workouts (count)' },
  { value: 'workout_time', label: 'Workout Duration (mins)' }
];
```

Replace with:

```ts
import { Loader } from 'lucide-react';
import { GOAL_TYPES } from '@/lib/goalTypes';

type AddGoalFormProps = {
  onGoalAdded: (goal: Goal) => void;
  userId: string;
};
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Visit `/goals`, confirm "Add Goal" still works exactly as before (same dropdown options, same
behavior) - this step is a pure refactor, nothing should look or behave differently.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/types.ts lib/goalTypes.ts app/goals/_components/AddGoalForm.tsx
git commit -m "$(cat <<'EOF'
Add shared types for advanced onboarding pages, extract GOAL_TYPES

LifestyleAnswers gains optional activityPreferences/equipment/nutrition
fields (existing rows remain valid - all new fields optional). GOAL_TYPES
extracted from AddGoalForm.tsx into lib/goalTypes.ts so the new Goals
onboarding page can reuse it instead of duplicating the list.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire flag-fetching + Goals step into AiSetupFlow

**Files:**
- Create: `app/ai-setup/_components/GoalsStep.tsx`
- Modify: `app/ai-setup/_components/AiSetupFlow.tsx`

**Interfaces:**
- Consumes: `GOAL_TYPES` from `lib/goalTypes.ts` (Task 2).
- Produces: `GoalEntry` type (exported from `GoalsStep.tsx`), the `enabledKeys`/`stepAfter`/
  `advanceFrom` pattern in `AiSetupFlow.tsx` that Task 4 replicates for the other three steps.

- [ ] **Step 1: Create `GoalsStep.tsx`**

```tsx
// app/ai-setup/_components/GoalsStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GOAL_TYPES } from '@/lib/goalTypes';

export type GoalEntry = {
  goalType: string;
  targetValue: number;
};

type GoalsStepProps = {
  onContinue: (goals: GoalEntry[]) => void;
  onSkip: () => void;
};

export function GoalsStep({ onContinue, onSkip }: GoalsStepProps) {
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [goalType, setGoalType] = useState<string>(GOAL_TYPES[0].value);
  const [targetValue, setTargetValue] = useState('');

  const handleAdd = () => {
    if (!targetValue || isNaN(Number(targetValue))) return;
    setGoals((prev) => [...prev, { goalType, targetValue: Number(targetValue) }]);
    setTargetValue('');
  };

  const handleRemove = (index: number) => {
    setGoals((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>What are your goals?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {goals.length > 0 && (
          <ul className="space-y-2">
            {goals.map((g, i) => {
              const label = GOAL_TYPES.find((t) => t.value === g.goalType)?.label ?? g.goalType;
              return (
                <li key={i} className="flex items-center justify-between text-sm border rounded-md p-2">
                  <span>{label}: {g.targetValue}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-2">
          <Label htmlFor="goalType">Goal Type</Label>
          <select
            id="goalType"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="targetValue">Target Value</Label>
          <Input
            id="targetValue"
            type="number"
            placeholder="Enter target value"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            min="0"
            step="any"
          />
        </div>

        <Button type="button" variant="outline" onClick={handleAdd}>
          Add Goal
        </Button>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button type="button" onClick={() => onContinue(goals)}>Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Extend `AiSetupFlow.tsx`'s imports and `Step` type**

Find:

```ts
import { ConsentStep } from './ConsentStep';
import { LifestyleForm } from './LifestyleForm';
import { PlanPreview } from './PlanPreview';
import type { LifestyleAnswers, WorkoutPlanEntry } from '@/lib/ai/types';

type Step = 'loading' | 'consent' | 'questionnaire' | 'generating' | 'preview' | 'error';
```

Replace with:

```ts
import { ConsentStep } from './ConsentStep';
import { LifestyleForm } from './LifestyleForm';
import { GoalsStep, type GoalEntry } from './GoalsStep';
import { PlanPreview } from './PlanPreview';
import type { LifestyleAnswers, WorkoutPlanEntry } from '@/lib/ai/types';

const ORDERED_PAGE_KEYS = ['goals', 'activity_preferences', 'equipment', 'nutrition'] as const;
type PageKey = (typeof ORDERED_PAGE_KEYS)[number];

type Step = 'loading' | 'consent' | 'questionnaire' | PageKey | 'generating' | 'preview' | 'error';
```

- [ ] **Step 3: Add `enabledKeys` and `goals` state**

Find:

```ts
  const [step, setStep] = useState<Step>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [plan, setPlan] = useState<WorkoutPlanEntry[] | null>(null);
```

Replace with:

```ts
  const [step, setStep] = useState<Step>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<PageKey[]>([]);
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [plan, setPlan] = useState<WorkoutPlanEntry[] | null>(null);
```

- [ ] **Step 4: Fetch `onboarding_page_flags` in the initial effect**

Find:

```ts
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, lifestyle')
        .eq('userId', user.id)
        .single();

      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      setInitialLifestyle(profile.lifestyle ?? null);
      setStep('consent');
```

Replace with:

```ts
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, lifestyle')
        .eq('userId', user.id)
        .single();

      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      setInitialLifestyle(profile.lifestyle ?? null);

      const { data: flags } = await supabase
        .from('onboarding_page_flags')
        .select('pageKey, isEnabled');
      const enabledSet = new Set(
        (flags ?? []).filter((f) => f.isEnabled).map((f) => f.pageKey)
      );
      setEnabledKeys(ORDERED_PAGE_KEYS.filter((k) => enabledSet.has(k)));

      setStep('consent');
```

(If the fetch fails or returns nothing, `enabledKeys` stays `[]` and every advanced page is
skipped - the flow degrades to exactly today's behavior rather than crashing.)

- [ ] **Step 5: Add `stepAfter` and `advanceFrom` helpers, and the Goals continue/skip handlers**

Find:

```ts
  const handleQuestionnaireSubmit = async (answers: LifestyleAnswers) => {
    setLifestyle(answers);
    setStep('generating');
    await requestPlan(answers);
  };
```

Replace with:

```ts
  const stepAfter = (current: Step): Step => {
    if (current === 'questionnaire') {
      return enabledKeys[0] ?? 'generating';
    }
    const idx = enabledKeys.indexOf(current as PageKey);
    return enabledKeys[idx + 1] ?? 'generating';
  };

  const advanceFrom = async (current: PageKey) => {
    const next = stepAfter(current);
    if (next === 'generating') {
      setStep('generating');
      if (lifestyle) await requestPlan(lifestyle);
    } else {
      setStep(next);
    }
  };

  const handleQuestionnaireSubmit = async (answers: LifestyleAnswers) => {
    setLifestyle(answers);
    const next = stepAfter('questionnaire');
    if (next === 'generating') {
      setStep('generating');
      await requestPlan(answers);
    } else {
      setStep(next);
    }
  };

  const handleGoalsContinue = (entries: GoalEntry[]) => {
    setGoals(entries);
    advanceFrom('goals');
  };

  const handleGoalsSkip = () => {
    advanceFrom('goals');
  };
```

- [ ] **Step 6: Render the Goals step**

Find:

```tsx
      {step === 'questionnaire' && (
        <LifestyleForm
          submitting={false}
          initialAnswers={initialLifestyle}
          onSubmit={handleQuestionnaireSubmit}
        />
      )}

      {step === 'generating' && (
```

Replace with:

```tsx
      {step === 'questionnaire' && (
        <LifestyleForm
          submitting={false}
          initialAnswers={initialLifestyle}
          onSubmit={handleQuestionnaireSubmit}
        />
      )}

      {step === 'goals' && (
        <GoalsStep onContinue={handleGoalsContinue} onSkip={handleGoalsSkip} />
      )}

      {step === 'generating' && (
```

- [ ] **Step 7: Save goals on final Save**

Find (in `handleSave`):

```ts
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;

      router.push(returnTo);
```

Replace with:

```ts
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;

      if (goals.length > 0) {
        const goalRows = goals.map((g) => ({
          profileId,
          goalType: g.goalType,
          targetValue: g.targetValue,
        }));
        const { error: goalsError } = await supabase.from('fitness_goals').insert(goalRows);
        if (goalsError) throw goalsError;
      }

      router.push(returnTo);
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Manual verification**

Using a disposable test account/profile:
- Temporarily disable the other 3 flags so only `goals` is enabled:
  ```sql
  update onboarding_page_flags set "isEnabled" = false where "pageKey" != 'goals';
  ```
- Run `/ai-setup?returnTo=/profile`: Consent -> accept -> Lifestyle -> submit -> confirm the
  Goals page appears (not skipped straight to generating).
- Add two goals (e.g. Weight Loss: 5, Weekly Workouts: 4), click Continue -> confirm it proceeds
  to plan generation and Preview (since `goals` is the only enabled page).
- Click Save -> confirm via SQL two new `fitness_goals` rows exist with the correct
  `goalType`/`targetValue`, and `profiles.aiEnabled` is `true`.
- Repeat, this time clicking Skip on the Goals page with zero goals added -> confirm it still
  proceeds to generation/Preview/Save with zero new `fitness_goals` rows.
- Re-enable the other 3 flags:
  ```sql
  update onboarding_page_flags set "isEnabled" = true where "pageKey" != 'goals';
  ```
- Clean up test `fitness_goals`/`workout_plans` rows and reset `aiEnabled`/`lifestyle` after
  verification.

- [ ] **Step 10: Commit**

```bash
git add app/ai-setup/_components/GoalsStep.tsx app/ai-setup/_components/AiSetupFlow.tsx
git commit -m "$(cat <<'EOF'
Wire onboarding_page_flags + Goals step into the AI setup flow

AiSetupFlow now fetches enabled page keys alongside profile data and
advances through them in order after the Lifestyle step, via a small
stepAfter/advanceFrom helper pair that Activity Preferences/Equipment/
Nutrition (next commit) reuse. Goals entered are saved as real
fitness_goals rows on the existing final Save action - same "nothing
persists until Save" invariant as the rest of this flow.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add Activity Preferences, Equipment, and Nutrition steps

**Files:**
- Create: `app/ai-setup/_components/ActivityPreferencesStep.tsx`
- Create: `app/ai-setup/_components/EquipmentStep.tsx`
- Create: `app/ai-setup/_components/NutritionStep.tsx`
- Modify: `app/ai-setup/_components/AiSetupFlow.tsx`

**Interfaces:**
- Consumes: `ACTIVITY_TYPES`, `EQUIPMENT_OPTIONS`, `ActivityPreferences`, `EquipmentAnswers`,
  `NutritionAnswers` from `lib/ai/types.ts` (Task 2); the `stepAfter`/`advanceFrom`/`PageKey`
  pattern from `AiSetupFlow.tsx` (Task 3).

- [ ] **Step 1: Create `ActivityPreferencesStep.tsx`**

```tsx
// app/ai-setup/_components/ActivityPreferencesStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVITY_TYPES, type ActivityPreferences } from '@/lib/ai/types';

type ActivityPreferencesStepProps = {
  onContinue: (answers: ActivityPreferences) => void;
  onSkip: () => void;
};

export function ActivityPreferencesStep({ onContinue, onSkip }: ActivityPreferencesStepProps) {
  const [enjoyedTypes, setEnjoyedTypes] = useState<string[]>([]);
  const [dislikedTypes, setDislikedTypes] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<ActivityPreferences['environment']>('either');
  const [social, setSocial] = useState<ActivityPreferences['social']>('either');

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>What kind of activity do you enjoy?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Types you enjoy</Label>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type} className="flex items-center space-x-2">
                <Checkbox
                  checked={enjoyedTypes.includes(type)}
                  onCheckedChange={() => toggle(enjoyedTypes, setEnjoyedTypes, type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Types you dislike</Label>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type} className="flex items-center space-x-2">
                <Checkbox
                  checked={dislikedTypes.includes(type)}
                  onCheckedChange={() => toggle(dislikedTypes, setDislikedTypes, type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Indoor or outdoor?</Label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as ActivityPreferences['environment'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="indoor">Indoor</SelectItem>
              <SelectItem value="outdoor">Outdoor</SelectItem>
              <SelectItem value="either">Either</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Solo or group?</Label>
          <Select value={social} onValueChange={(v) => setSocial(v as ActivityPreferences['social'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solo">Solo</SelectItem>
              <SelectItem value="group">Group classes</SelectItem>
              <SelectItem value="either">Either</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button
            type="button"
            onClick={() => onContinue({ enjoyedTypes, dislikedTypes, environment, social })}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `EquipmentStep.tsx`**

```tsx
// app/ai-setup/_components/EquipmentStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EQUIPMENT_OPTIONS, type EquipmentAnswers } from '@/lib/ai/types';

type EquipmentStepProps = {
  onContinue: (answers: EquipmentAnswers) => void;
  onSkip: () => void;
};

export function EquipmentStep({ onContinue, onSkip }: EquipmentStepProps) {
  const [trainingLocation, setTrainingLocation] = useState<EquipmentAnswers['trainingLocation']>('mixed');
  const [availableEquipment, setAvailableEquipment] = useState<string[]>([]);

  const toggle = (value: string) => {
    setAvailableEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Where do you train?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Training location</Label>
          <Select
            value={trainingLocation}
            onValueChange={(v) => setTrainingLocation(v as EquipmentAnswers['trainingLocation'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commercial_gym">Commercial gym</SelectItem>
              <SelectItem value="home_gym">Home gym</SelectItem>
              <SelectItem value="bodyweight_only">Bodyweight only</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Available equipment</Label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-center space-x-2">
                <Checkbox
                  checked={availableEquipment.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button
            type="button"
            onClick={() => onContinue({ trainingLocation, availableEquipment })}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `NutritionStep.tsx`**

```tsx
// app/ai-setup/_components/NutritionStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NutritionAnswers } from '@/lib/ai/types';

type NutritionStepProps = {
  onContinue: (answers: NutritionAnswers) => void;
  onSkip: () => void;
};

export function NutritionStep({ onContinue, onSkip }: NutritionStepProps) {
  const [dietStyle, setDietStyle] = useState<NutritionAnswers['dietStyle']>('none');
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [restrictions, setRestrictions] = useState('');

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Your nutrition habits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Diet style</Label>
          <Select value={dietStyle} onValueChange={(v) => setDietStyle(v as NutritionAnswers['dietStyle'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No restrictions</SelectItem>
              <SelectItem value="vegetarian">Vegetarian</SelectItem>
              <SelectItem value="vegan">Vegan</SelectItem>
              <SelectItem value="keto">Keto</SelectItem>
              <SelectItem value="paleo">Paleo</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Meals per day: {mealsPerDay}</Label>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={mealsPerDay}
            onChange={(e) => setMealsPerDay(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="restrictions">Allergies or restrictions (optional)</Label>
          <textarea
            id="restrictions"
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            className="w-full p-2 border rounded-md h-20"
            placeholder="e.g. lactose intolerant, nut allergy"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button type="button" onClick={() => onContinue({ dietStyle, mealsPerDay, restrictions })}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Wire the three new steps into `AiSetupFlow.tsx` - imports and state**

Find:

```ts
import { GoalsStep, type GoalEntry } from './GoalsStep';
import { PlanPreview } from './PlanPreview';
import type { LifestyleAnswers, WorkoutPlanEntry } from '@/lib/ai/types';
```

Replace with:

```ts
import { GoalsStep, type GoalEntry } from './GoalsStep';
import { ActivityPreferencesStep } from './ActivityPreferencesStep';
import { EquipmentStep } from './EquipmentStep';
import { NutritionStep } from './NutritionStep';
import { PlanPreview } from './PlanPreview';
import type {
  LifestyleAnswers,
  WorkoutPlanEntry,
  ActivityPreferences,
  EquipmentAnswers,
  NutritionAnswers,
} from '@/lib/ai/types';
```

Find:

```ts
  const [enabledKeys, setEnabledKeys] = useState<PageKey[]>([]);
  const [goals, setGoals] = useState<GoalEntry[]>([]);
```

Replace with:

```ts
  const [enabledKeys, setEnabledKeys] = useState<PageKey[]>([]);
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [activityPreferences, setActivityPreferences] = useState<ActivityPreferences | undefined>(undefined);
  const [equipment, setEquipment] = useState<EquipmentAnswers | undefined>(undefined);
  const [nutrition, setNutrition] = useState<NutritionAnswers | undefined>(undefined);
```

- [ ] **Step 5: Add continue/skip handlers for the three new steps**

Find:

```ts
  const handleGoalsContinue = (entries: GoalEntry[]) => {
    setGoals(entries);
    advanceFrom('goals');
  };

  const handleGoalsSkip = () => {
    advanceFrom('goals');
  };
```

Replace with:

```ts
  const handleGoalsContinue = (entries: GoalEntry[]) => {
    setGoals(entries);
    advanceFrom('goals');
  };

  const handleGoalsSkip = () => {
    advanceFrom('goals');
  };

  const handleActivityContinue = (answers: ActivityPreferences) => {
    setActivityPreferences(answers);
    advanceFrom('activity_preferences');
  };

  const handleActivitySkip = () => {
    advanceFrom('activity_preferences');
  };

  const handleEquipmentContinue = (answers: EquipmentAnswers) => {
    setEquipment(answers);
    advanceFrom('equipment');
  };

  const handleEquipmentSkip = () => {
    advanceFrom('equipment');
  };

  const handleNutritionContinue = (answers: NutritionAnswers) => {
    setNutrition(answers);
    advanceFrom('nutrition');
  };

  const handleNutritionSkip = () => {
    advanceFrom('nutrition');
  };
```

- [ ] **Step 6: Render the three new steps**

Find:

```tsx
      {step === 'goals' && (
        <GoalsStep onContinue={handleGoalsContinue} onSkip={handleGoalsSkip} />
      )}

      {step === 'generating' && (
```

Replace with:

```tsx
      {step === 'goals' && (
        <GoalsStep onContinue={handleGoalsContinue} onSkip={handleGoalsSkip} />
      )}

      {step === 'activity_preferences' && (
        <ActivityPreferencesStep onContinue={handleActivityContinue} onSkip={handleActivitySkip} />
      )}

      {step === 'equipment' && (
        <EquipmentStep onContinue={handleEquipmentContinue} onSkip={handleEquipmentSkip} />
      )}

      {step === 'nutrition' && (
        <NutritionStep onContinue={handleNutritionContinue} onSkip={handleNutritionSkip} />
      )}

      {step === 'generating' && (
```

- [ ] **Step 7: Merge the three answers into `lifestyle` on Save**

Find (in `handleSave`):

```ts
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;
```

Replace with:

```ts
      const fullLifestyle: LifestyleAnswers = {
        ...lifestyle,
        ...(activityPreferences && { activityPreferences }),
        ...(equipment && { equipment }),
        ...(nutrition && { nutrition }),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle: fullLifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Manual verification**

Confirm all 4 flags are enabled (from Task 3's cleanup) via
`select "pageKey", "isEnabled" from onboarding_page_flags;`.

Using a disposable test account:
- Run `/ai-setup?returnTo=/profile`: Consent -> Lifestyle -> confirm all 4 pages appear in
  order: Goals, Activity Preferences, Equipment & Environment, Nutrition Habits, then Preview.
- On Activity Preferences: check a couple of enjoyed/disliked types, pick Outdoor/Group,
  Continue.
- On Equipment: pick Home gym, check Dumbbells + Kettlebell, Continue.
- On Nutrition: pick Vegetarian, set 4 meals/day, type "nut allergy", Continue.
- Skip Goals this time (zero goals).
- Reach Preview, Save. Confirm via SQL:
  ```sql
  select lifestyle from profiles where id = '<test-profile-id>';
  ```
  `lifestyle` contains `activityPreferences`, `equipment`, `nutrition` keys matching what was
  entered, and no `fitness_goals` rows were added (since Goals was skipped).
- As a second pass, disable one flag (e.g. `nutrition`) via SQL, re-run the flow, confirm the
  Nutrition page no longer appears at all and the flow still completes normally with the other
  three pages plus Lifestyle/Preview.
- Confirm a profile with an old-shape `lifestyle` (no new keys, from before this feature) still
  loads correctly in the Lifestyle pre-fill step without errors.
- Clean up all test data (`fitness_goals`, `workout_plans`, `lifestyle`, `aiEnabled`) and
  restore all 4 flags to enabled after verification.

- [ ] **Step 10: Commit**

```bash
git add app/ai-setup/_components/ActivityPreferencesStep.tsx app/ai-setup/_components/EquipmentStep.tsx app/ai-setup/_components/NutritionStep.tsx app/ai-setup/_components/AiSetupFlow.tsx
git commit -m "$(cat <<'EOF'
Add Activity Preferences, Equipment, and Nutrition onboarding steps

Same continue/skip pattern as GoalsStep, reusing AiSetupFlow's
stepAfter/advanceFrom helpers. Answers merge into profiles.lifestyle
on Save; nothing persists if a page is skipped.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Admin gear icon + toggle modal on Profile page

**Files:**
- Create: `app/profile/_components/OnboardingPageTogglesModal.tsx`
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `onboarding_page_flags` table (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Create `OnboardingPageTogglesModal.tsx`**

```tsx
// app/profile/_components/OnboardingPageTogglesModal.tsx
'use client';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

type PageFlag = {
  pageKey: string;
  label: string;
  isEnabled: boolean;
};

type OnboardingPageTogglesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OnboardingPageTogglesModal({ open, onOpenChange }: OnboardingPageTogglesModalProps) {
  const supabase = createClientComponentClient();
  const [flags, setFlags] = useState<PageFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('onboarding_page_flags')
        .select('pageKey, label, isEnabled')
        .order('pageKey');
      setFlags(data ?? []);
      setLoading(false);
    })();
  }, [open, supabase]);

  const handleToggle = async (pageKey: string, next: boolean) => {
    setFlags((prev) => prev.map((f) => (f.pageKey === pageKey ? { ...f, isEnabled: next } : f)));
    await supabase.from('onboarding_page_flags').update({ isEnabled: next }).eq('pageKey', pageKey);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Onboarding Pages</DialogTitle>
        </DialogHeader>
        {loading ? (
          <Loader2 className="animate-spin h-6 w-6 mx-auto" />
        ) : (
          <div className="space-y-4">
            {flags.map((flag) => (
              <div key={flag.pageKey} className="flex items-center justify-between">
                <Label htmlFor={`flag-${flag.pageKey}`}>{flag.label}</Label>
                <Switch
                  id={`flag-${flag.pageKey}`}
                  checked={flag.isEnabled}
                  onCheckedChange={(checked) => handleToggle(flag.pageKey, checked)}
                />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the gear icon and modal state to `app/profile/page.tsx`**

Find:

```ts
import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame } from 'lucide-react';
```

Replace with:

```ts
import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame, Settings } from 'lucide-react';
import { OnboardingPageTogglesModal } from './_components/OnboardingPageTogglesModal';
```

Find:

```ts
  const [disablingAi, setDisablingAi] = useState(false);
```

Replace with:

```ts
  const [disablingAi, setDisablingAi] = useState(false);
  const [showPageToggles, setShowPageToggles] = useState(false);
```

- [ ] **Step 3: Add the gear button to the admin section**

Find:

```tsx
            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-amber-500" />
                      Test Push Notifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - send yourself a real push notification to verify delivery.
                    </p>
                    <Button onClick={handleSendTestPush} disabled={testSending}>
                      {testSending ? 'Sending...' : 'Send Test Push'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
```

Replace with:

```tsx
            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-amber-500" />
                      Test Push Notifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - send yourself a real push notification to verify delivery.
                    </p>
                    <Button onClick={handleSendTestPush} disabled={testSending}>
                      {testSending ? 'Sending...' : 'Send Test Push'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-amber-500" />
                      Onboarding Pages
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - control which advanced onboarding pages are shown to everyone
                      in the AI setup flow.
                    </p>
                    <Button variant="outline" onClick={() => setShowPageToggles(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Manage Pages
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
```

- [ ] **Step 4: Render the modal**

Find the closing of the component's main return (near the end, right before `<BottomNav />`
at the top level - the same level as other page content, not nested inside the `isAdmin` block):

```tsx
            <div className="mt-6 text-center">
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
              </Button>
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
```

Replace with:

```tsx
            <div className="mt-6 text-center">
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? <Loader2 className="animate-spin w-5 h-5" /> : 'Log Out'}
              </Button>
            </div>
          </>
        )}
      </main>
      <OnboardingPageTogglesModal open={showPageToggles} onOpenChange={setShowPageToggles} />
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Using a test account with `isAdmin: true`:
- Visit `/profile`, confirm the new "Onboarding Pages" admin card shows below "Test Push
  Notifications".
- Click "Manage Pages" - confirm the modal opens showing all 4 pages with switches, all on.
- Turn off "Nutrition Habits" - confirm via SQL
  (`select "isEnabled" from onboarding_page_flags where "pageKey" = 'nutrition';`) that it
  flipped to `false` immediately, no page reload needed.
- Close and reopen the modal - confirm the toggle state persisted (re-fetched correctly).
- Turn it back on, confirm it flips back.
- Log in (or check via SQL) as a non-admin profile - confirm no "Onboarding Pages" card appears
  for them.

- [ ] **Step 7: Commit**

```bash
git add app/profile/_components/OnboardingPageTogglesModal.tsx app/profile/page.tsx
git commit -m "$(cat <<'EOF'
Add admin gear icon to toggle onboarding pages on/off

Each switch writes to onboarding_page_flags immediately, same
instant-action pattern as the existing Send Test Push button - no
separate save step.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
