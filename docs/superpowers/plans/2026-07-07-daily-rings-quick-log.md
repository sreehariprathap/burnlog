# Daily Rings & Quick Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily-progress rings widget (burn/eat/workout-minutes/steps) and a floating "+" quick-log menu (Log Calories, Log Workout, Log Steps) to the dashboard.

**Architecture:** Reuse existing tables (`calorie_burns`, `food_intakes`) and the existing `/api/ai/scan-food` endpoint; add one new table (`step_entries`), two new goal types, and one new AI endpoint (`/api/ai/estimate-workout-calories`). All new UI lives under `app/dashboard/_components/`, following the manual-form + Supabase-insert pattern already used by `app/goals/_components/CalorieTracker.tsx` and `FoodIntakeTracker.tsx`.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (`@supabase/auth-helpers-nextjs`), Prisma (schema-only, no migration files — this repo uses `prisma db push`), Radix UI primitives (`components/ui/*`), Tailwind, `openai` SDK against OpenRouter.

## Global Constraints

- No automated test framework exists in this repo (no jest/vitest in `package.json`). Verification is manual, in-browser, against the dev server (`npm run dev`).
- Schema changes are applied via `npx prisma db push` (not `prisma migrate`) — there is no `prisma/migrations` directory. After pushing schema, RLS policies must be added by hand to `supabase/rls.sql` and re-run in the Supabase SQL editor (this repo's committed convention, see the comment header of that file).
- All new Supabase table access must go through `profileId`, resolved via `profiles.userId = auth.uid()`, matching every existing table in `supabase/rls.sql`.
- Existing components (`FoodScanner.tsx`) must be reused, not duplicated.
- Follow existing code style: `'use client'` components, `createClientComponentClient()` for client-side Supabase, manual `useState`/`useEffect` (no data-fetching library), Tailwind utility classes, `components/ui/*` primitives.

---

### Task 1: Add goal types, `StepEntry` table, and RLS policy

**Files:**
- Modify: `lib/goalTypes.ts`
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Produces: `StepEntry` Prisma model mapped to table `step_entries` with columns `id, profileId, date, steps, createdAt`, RLS-protected identically to `calorie_burns`/`food_intakes`. Produces two new goal type values usable anywhere `GOAL_TYPES` is imported: `'calories_intake'` and `'daily_steps'`.

- [ ] **Step 1: Add the two new goal types**

Edit `lib/goalTypes.ts` to:

```ts
// lib/goalTypes.ts

export const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss (kg)' },
  { value: 'weight_gain', label: 'Weight Gain (kg)' },
  { value: 'calories_burned', label: 'Daily Calories Burned (kcal)' },
  { value: 'calories_intake', label: 'Daily Calories Intake (kcal)' },
  { value: 'running_distance', label: 'Running Distance (km)' },
  { value: 'workout_frequency', label: 'Weekly Workouts (count)' },
  { value: 'workout_time', label: 'Workout Duration (mins)' },
  { value: 'daily_steps', label: 'Daily Steps (count)' },
] as const;
```

- [ ] **Step 2: Add the `StepEntry` model to the Prisma schema**

In `prisma/schema.prisma`, add `StepEntry[]` to the `Profile` model's relations list (next to `StaminaSession StaminaSession[]`):

```prisma
  StaminaSession StaminaSession[]
  StepEntry      StepEntry[]
```

Then add a new model after `StaminaSession` (before `OnboardingPageFlag`):

```prisma
/// daily step count tracking
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

- [ ] **Step 3: Push the schema to the database**

Run: `npx prisma db push`
Expected output: confirms `step_entries` table created, ends with "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected output: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Add `step_entries` to the RLS policy loop**

In `supabase/rls.sql`, add `'step_entries'` to the array inside the `do $$ ... end $$;` block:

```sql
  foreach t in array array[
    'fitness_goals',
    'workouts',
    'workout_plans',
    'sessions',
    'weight_entries',
    'calorie_burns',
    'food_intakes',
    'stamina_sessions',
    'step_entries'
  ]
```

Also update the comment above it (currently lists the 8 owned tables) to include `step_entries`.

- [ ] **Step 5: Apply the RLS policy manually**

Run the full updated contents of `supabase/rls.sql` in the Supabase project's SQL editor (same manual step this repo already requires for every schema change — see the file's header comment). This is a one-time manual action; there is no CLI command for it in this repo.

- [ ] **Step 6: Verify**

In the Supabase dashboard (Table Editor), confirm `step_entries` exists with columns `id, profileId, date, steps, createdAt`, and that RLS is enabled with an `step_entries_owner_access` policy listed under Authentication → Policies.

- [ ] **Step 7: Commit**

```bash
git add lib/goalTypes.ts prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add step_entries table and daily calorie/step goal types"
```

---

### Task 2: Daily targets helper

**Files:**
- Create: `lib/dailyTargets.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces:
  - `DEFAULT_TARGETS: Record<string, number>` keyed by goal type (`calories_burned`, `calories_intake`, `workout_time`, `daily_steps`).
  - `resolveTarget(goals: { goalType: string; targetValue: number }[], goalType: string): number` — returns the matching goal's `targetValue` if present and positive, else the default for that `goalType`.
  - `getTodayRange(): { start: string; end: string }` — ISO strings for the start (00:00 local) and end (next day 00:00 local) of the current calendar day, for `.gte(...).lt(...)` Supabase date filters.

- [ ] **Step 1: Write the helper**

```ts
// lib/dailyTargets.ts

export const DEFAULT_TARGETS: Record<string, number> = {
  calories_burned: 900,
  calories_intake: 1800,
  workout_time: 30,
  daily_steps: 8000,
};

export function resolveTarget(
  goals: { goalType: string; targetValue: number }[],
  goalType: string
): number {
  const goal = goals.find((g) => g.goalType === goalType);
  const value = goal ? Number(goal.targetValue) : undefined;
  return value && value > 0 ? value : DEFAULT_TARGETS[goalType];
}

export function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors introduced by this file (pre-existing errors elsewhere, if any, are unrelated and out of scope).

- [ ] **Step 3: Commit**

```bash
git add lib/dailyTargets.ts
git commit -m "feat: add daily target resolution helper"
```

---

### Task 3: Daily Rings widget

**Files:**
- Create: `app/dashboard/_components/DailyRingsWidget.tsx`

**Interfaces:**
- Consumes: `DEFAULT_TARGETS`, `resolveTarget`, `getTodayRange` from `lib/dailyTargets.ts` (Task 2). Reads from Supabase tables `fitness_goals`, `calorie_burns`, `food_intakes`, `step_entries` (Task 1).
- Produces: `DailyRingsWidget({ profileId, refreshKey }: { profileId: string; refreshKey: number })` — a React component. `refreshKey` is used only as a `useEffect` dependency to trigger a refetch; the caller increments it after any quick-log save.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveTarget, getTodayRange } from '@/lib/dailyTargets';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

const RINGS = [
  { key: 'burn' as const, goalType: 'calories_burned', color: '#F97316', radius: 88, label: 'Calories Burned', unit: 'kcal' },
  { key: 'eat' as const, goalType: 'calories_intake', color: '#22C55E', radius: 72, label: 'Calories Eaten', unit: 'kcal' },
  { key: 'workoutMinutes' as const, goalType: 'workout_time', color: '#3B82F6', radius: 56, label: 'Workout Minutes', unit: 'min' },
  { key: 'steps' as const, goalType: 'daily_steps', color: '#A855F7', radius: 40, label: 'Steps', unit: 'steps' },
];

type DailyRingsWidgetProps = {
  profileId: string;
  refreshKey: number;
};

export function DailyRingsWidget({ profileId, refreshKey }: DailyRingsWidgetProps) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ burn: 0, eat: 0, workoutMinutes: 0, steps: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getTodayRange();

      const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
        supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
        supabase
          .from('calorie_burns')
          .select('caloriesBurned, duration')
          .eq('profileId', profileId)
          .gte('date', start)
          .lt('date', end),
        supabase.from('food_intakes').select('calories').eq('profileId', profileId).gte('date', start).lt('date', end),
        supabase.from('step_entries').select('steps').eq('profileId', profileId).gte('date', start).lt('date', end),
      ]);

      setGoals((goalsRes.data as Goal[]) || []);

      const burnRows = (burnRes.data as { caloriesBurned: number; duration: number }[]) || [];
      const eatRows = (eatRes.data as { calories: number }[]) || [];
      const stepRows = (stepsRes.data as { steps: number }[]) || [];

      setMetrics({
        burn: burnRows.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0),
        eat: eatRows.reduce((sum, r) => sum + (r.calories || 0), 0),
        workoutMinutes: burnRows.reduce((sum, r) => sum + (r.duration || 0), 0),
        steps: stepRows.reduce((sum, r) => sum + (r.steps || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching daily rings data:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <Skeleton className="h-48 w-48 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const values: Record<string, number> = {
    burn: metrics.burn,
    eat: metrics.eat,
    workoutMinutes: metrics.workoutMinutes,
    steps: metrics.steps,
  };

  const size = 200;
  const center = size / 2;

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col items-center gap-4">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {RINGS.map((ring) => {
              const target = resolveTarget(goals, ring.goalType);
              const value = values[ring.key];
              const pct = target > 0 ? Math.min(1, value / target) : 0;
              const circumference = 2 * Math.PI * ring.radius;
              const offset = circumference * (1 - pct);

              return (
                <g key={ring.key}>
                  <circle
                    cx={center}
                    cy={center}
                    r={ring.radius}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeWidth={12}
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={ring.radius}
                    fill="none"
                    stroke={ring.color}
                    strokeWidth={12}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${center} ${center})`}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{metrics.steps.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">steps today</span>
          </div>
        </div>

        <div className="w-full space-y-1">
          {RINGS.map((ring) => {
            const hasGoal = goals.some((g) => g.goalType === ring.goalType);
            const target = resolveTarget(goals, ring.goalType);
            const value = values[ring.key];
            return (
              <div key={ring.key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ring.color }} />
                  <span>{ring.label}</span>
                </div>
                <span className="text-muted-foreground">
                  {Math.round(value)} / {target} {ring.unit}
                  {!hasGoal && ' (default)'}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors from this file.

This component is wired into the dashboard page in Task 6, where it gets full end-to-end verification with real data.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/_components/DailyRingsWidget.tsx
git commit -m "feat: add daily rings widget for burn/eat/workout/steps progress"
```

---

### Task 4: `estimate-workout-calories` AI endpoint

**Files:**
- Create: `app/api/ai/estimate-workout-calories/route.ts`

**Interfaces:**
- Consumes: authenticated Supabase session (`createRouteHandlerClient`), the caller's `profiles` row (`weight`, `age`).
- Produces: `POST /api/ai/estimate-workout-calories` accepting `{ activityType: string; durationMinutes: number }`, returning `{ caloriesBurned: number; notes: string }` on success (200) or `{ error: string }` on failure (401/400/502/500), matching the response shape and error-handling style of `app/api/ai/scan-food/route.ts`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const MODEL = process.env.AI_TEXT_MODEL || 'openai/gpt-oss-120b:free';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { activityType, durationMinutes } = body as {
      activityType?: string;
      durationMinutes?: number;
    };

    if (!activityType || !durationMinutes || durationMinutes <= 0) {
      return NextResponse.json({ error: 'activityType and a positive durationMinutes are required' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('weight, age')
      .eq('userId', user.id)
      .single();

    const weight = profile?.weight ?? 70;
    const age = profile?.age ?? 30;

    const prompt = `You are an exercise physiologist estimating calorie expenditure.

Activity: ${activityType}
Duration: ${durationMinutes} minutes
User: ${weight} kg, ${age} years old

Use a MET-based estimate appropriate for this activity type and duration, adjusted for the user's body weight.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "caloriesBurned": <integer estimate of total kcal burned for the full duration>,
  "notes": "one short sentence explaining the estimate (e.g. MET value used)"
}`;

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = parsed as Record<string, unknown>;
    const caloriesBurned = Number(result.caloriesBurned);

    if (!caloriesBurned || Number.isNaN(caloriesBurned) || caloriesBurned <= 0) {
      return NextResponse.json({ error: 'AI response missing a valid calorie estimate' }, { status: 502 });
    }

    return NextResponse.json({
      caloriesBurned: Math.round(caloriesBurned),
      notes: result.notes ?? '',
    });
  } catch (error) {
    console.error('estimate-workout-calories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verification**

Start the dev server: `npm run dev`

With a logged-in session cookie (test via the browser, logged in as a seeded/test user — see Task 7 for the full UI path), run:
```bash
curl -X POST http://localhost:3000/api/ai/estimate-workout-calories \
  -H "Content-Type: application/json" \
  --cookie "<paste session cookies from browser dev tools>" \
  -d '{"activityType": "Cycling", "durationMinutes": 30}'
```
Expected: `200` with JSON body `{"caloriesBurned": <number>, "notes": "..."}`. Without a valid session cookie, expect `401 {"error":"Not authenticated"}`.

This endpoint is exercised end-to-end through the UI in Task 7's manual verification, so a full curl-based check here is optional if that's more convenient.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/estimate-workout-calories/route.ts
git commit -m "feat: add AI workout calorie estimation endpoint"
```

---

### Task 5: Log Calories modal

**Files:**
- Create: `app/dashboard/_components/quick-log/LogCaloriesModal.tsx`

**Interfaces:**
- Consumes: existing `FoodScanner` component from `app/goals/_components/FoodScanner.tsx` (props: `onResult`, `onClose`), `components/ui/{card,button,input,label,tabs}`.
- Produces: `LogCaloriesModal({ profileId, onClose, onSaved }: { profileId: string; onClose: () => void; onSaved: () => void })`. Writes one row to `food_intakes` on save; calls `onSaved()` after a successful insert.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FoodScanner } from '@/app/goals/_components/FoodScanner';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

type LogCaloriesModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogCaloriesModal({ profileId, onClose, onSaved }: LogCaloriesModalProps) {
  const supabase = createClientComponentClient();
  const [tab, setTab] = useState<'manual' | 'photo'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleScanResult = (result: {
    foodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealType: string;
  }) => {
    setFoodName(result.foodName);
    setCalories(String(result.calories));
    setProtein(String(result.protein));
    setCarbs(String(result.carbs));
    setFat(String(result.fat));
    if (result.mealType) setMealType(result.mealType);
    setShowScanner(false);
    setTab('manual');
  };

  const handleSave = async () => {
    setError(null);
    if (!foodName.trim()) {
      setError('Please enter a food name');
      return;
    }
    if (!calories || isNaN(Number(calories))) {
      setError('Please enter valid calories');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('food_intakes').insert([
        {
          profileId,
          mealType,
          foodName,
          calories: Number(calories),
          protein: protein ? Number(protein) : null,
          carbs: carbs ? Number(carbs) : null,
          fat: fat ? Number(fat) : null,
        },
      ]);

      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  if (showScanner) {
    return <FoodScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Calories</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo')}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="photo">Photo (AI)</TabsTrigger>
            </TabsList>
            <TabsContent value="photo" className="pt-3">
              <Button className="w-full" onClick={() => setShowScanner(true)}>
                📸 Scan Food Photo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Take or upload a photo — AI estimates calories and macros, then you can review and save below.
              </p>
            </TabsContent>
            <TabsContent value="manual" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="mealType">Meal</Label>
                  <select
                    id="mealType"
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    {MEAL_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="calories">Calories</Label>
                  <Input id="calories" type="number" placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="foodName">Food Name</Label>
                <Input id="foodName" placeholder="What did you eat?" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="protein">Protein (g)</Label>
                  <Input id="protein" type="number" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carbs">Carbs (g)</Label>
                  <Input id="carbs" type="number" step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fat">Fat (g)</Label>
                  <Input id="fat" type="number" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors from this file. Full interactive verification happens in Task 7.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/_components/quick-log/LogCaloriesModal.tsx
git commit -m "feat: add Log Calories quick-log modal"
```

---

### Task 6: Log Workout and Log Steps modals

**Files:**
- Create: `app/dashboard/_components/quick-log/LogWorkoutModal.tsx`
- Create: `app/dashboard/_components/quick-log/LogStepsModal.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/estimate-workout-calories` (Task 4) for `LogWorkoutModal`'s AI path.
- Produces: `LogWorkoutModal({ profileId, onClose, onSaved })` — writes one row to `calorie_burns` (`activityType`, `duration`, `caloriesBurned`). `LogStepsModal({ profileId, onClose, onSaved })` — writes one row to `step_entries` (`profileId`, `date`, `steps`). Both call `onSaved()` after a successful insert, matching `LogCaloriesModal`'s contract from Task 5.

- [ ] **Step 1: Write `LogWorkoutModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { X, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const WORKOUT_TYPES = [
  { value: 'Gym', label: 'Gym' },
  { value: 'Cycling', label: 'Cycling' },
  { value: 'Swimming', label: 'Swimming' },
  { value: 'Other', label: 'Other' },
];

type LogWorkoutModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogWorkoutModal({ profileId, onClose, onSaved }: LogWorkoutModalProps) {
  const supabase = createClientComponentClient();
  const [activityType, setActivityType] = useState('Gym');
  const [duration, setDuration] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEstimate = async () => {
    setError(null);
    if (!duration || isNaN(Number(duration)) || Number(duration) <= 0) {
      setError('Enter a valid duration first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-workout-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityType, durationMinutes: Number(duration) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to estimate calories. Enter manually.');
        return;
      }
      setCaloriesBurned(String(data.caloriesBurned));
    } catch {
      setError('Network error. Enter calories manually.');
    } finally {
      setEstimating(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!duration || isNaN(Number(duration))) {
      setError('Please enter a valid duration');
      return;
    }
    if (!caloriesBurned || isNaN(Number(caloriesBurned))) {
      setError('Please enter valid calories (or calculate with AI)');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('calorie_burns').insert([
        {
          profileId,
          activityType,
          duration: Number(duration),
          caloriesBurned: Number(caloriesBurned),
        },
      ]);
      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Workout</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="activityType">Workout Type</Label>
            <select
              id="activityType"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              {WORKOUT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="duration">Duration (mins)</Label>
            <Input id="duration" type="number" placeholder="Minutes" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="caloriesBurned">Calories Burned</Label>
            <div className="flex gap-2">
              <Input
                id="caloriesBurned"
                type="number"
                placeholder="Calories"
                value={caloriesBurned}
                onChange={(e) => setCaloriesBurned(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleEstimate} disabled={estimating}>
                {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'AI'}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Write `LogStepsModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LogStepsModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogStepsModal({ profileId, onClose, onSaved }: LogStepsModalProps) {
  const supabase = createClientComponentClient();
  const [steps, setSteps] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!steps || isNaN(Number(steps)) || Number(steps) < 0) {
      setError('Please enter a valid step count');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('step_entries').insert([
        {
          profileId,
          date: new Date(date).toISOString(),
          steps: Number(steps),
        },
      ]);
      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save steps');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Steps</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="steps">Steps</Label>
            <Input id="steps" type="number" placeholder="e.g. 8000" value={steps} onChange={(e) => setSteps(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors from either file. Full interactive verification happens in Task 7.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/_components/quick-log/LogWorkoutModal.tsx app/dashboard/_components/quick-log/LogStepsModal.tsx
git commit -m "feat: add Log Workout and Log Steps quick-log modals"
```

---

### Task 7: Quick-log FAB and dashboard wiring

**Files:**
- Create: `app/dashboard/_components/QuickLogFab.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `LogCaloriesModal` (Task 5), `LogWorkoutModal`/`LogStepsModal` (Task 6), `DailyRingsWidget` (Task 3), `components/ui/dialog`, `components/ui/button`, `lucide-react`'s `Plus`.
- Produces: `QuickLogFab({ profileId, onLogged }: { profileId: string; onLogged: () => void })` — a fixed-position "+" button that opens a menu of 3 quick-log options, each opening its own modal; calls `onLogged()` after any modal reports a successful save.

- [ ] **Step 1: Write `QuickLogFab.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogCaloriesModal } from './quick-log/LogCaloriesModal';
import { LogWorkoutModal } from './quick-log/LogWorkoutModal';
import { LogStepsModal } from './quick-log/LogStepsModal';

type QuickLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

type ModalKey = 'menu' | 'calories' | 'workout' | 'steps' | null;

export function QuickLogFab({ profileId, onLogged }: QuickLogFabProps) {
  const [open, setOpen] = useState<ModalKey>(null);

  const handleSaved = () => {
    setOpen(null);
    onLogged();
  };

  return (
    <>
      <button
        onClick={() => setOpen('menu')}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Quick log"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Dialog open={open === 'menu'} onOpenChange={(isOpen) => !isOpen && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Log</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            <Button variant="outline" className="justify-start" onClick={() => setOpen('calories')}>
              🍽️ Log Calories
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setOpen('workout')}>
              🏋️ Log Workout
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setOpen('steps')}>
              🚶 Log Steps
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {open === 'calories' && (
        <LogCaloriesModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'workout' && (
        <LogWorkoutModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'steps' && (
        <LogStepsModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire `DailyRingsWidget` and `QuickLogFab` into the dashboard page**

In `app/dashboard/page.tsx`:

Add imports near the other `_components` imports (after the `ShortcutWidget` import at line 15):
```tsx
import { DailyRingsWidget } from './_components/DailyRingsWidget';
import { QuickLogFab } from './_components/QuickLogFab';
```

Add a `refreshKey` state next to the other `useState` calls (after the `deferredPrompt` state at line 29):
```tsx
  const [refreshKey, setRefreshKey] = useState(0);
```

Insert the rings widget as its own full-width section, directly above the existing `{/* New Insight Widgets in Grid Layout */}` grid (before line 158's `<div className="grid grid-cols-4 gap-4">`):
```tsx
        {/* Daily Rings */}
        {userProfile && (
          <DailyRingsWidget profileId={userProfile.id} refreshKey={refreshKey} />
        )}

```

Add the FAB just before the closing `<BottomNav />` (after the closing `</main>` tag around line 217), so it floats over the whole page:
```tsx
      </main>
      {userProfile && (
        <QuickLogFab profileId={userProfile.id} onLogged={() => setRefreshKey((k) => k + 1)} />
      )}
      <BottomNav />
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Run: `npm run dev`, open `http://localhost:3000/dashboard` in a browser as a logged-in test user with at least one `fitness_goals` row (any type) already set (to exercise both the "has goal" and "(default)" legend paths — set only one of the four goal types before testing, so the other three show "(default)").

Verify:
1. The rings widget renders 4 concentric colored rings and a legend with correct `value / target` numbers (all `0 / target` on a fresh account).
2. The "+" button is visible bottom-right, above the bottom nav, and tapping it opens the Quick Log menu with 3 options.
3. **Log Steps**: enter a step count, save — modal closes, rings widget's steps ring and center number update without a full page reload.
4. **Log Calories → Manual**: fill in food name + calories, save — eat ring updates.
5. **Log Calories → Photo (AI)**: tap "Scan Food Photo", upload a food image, confirm the AI result appears with calories/macros, tap "Log This Meal", confirm it prefills the manual tab, save — eat ring updates again.
6. **Log Workout → Manual**: pick a workout type, enter duration + calories manually, save — burn ring and workout-minutes ring both update.
7. **Log Workout → AI**: pick a workout type, enter duration, tap "AI" next to calories, confirm a number is filled in, save — burn/workout-minutes rings update.
8. Disconnect network (or temporarily rename `NEXT_OPENROUTER_KEY` in `.env`) and repeat steps 5 and 7: confirm an inline error appears in the modal and the manual fields remain editable and saveable.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/_components/QuickLogFab.tsx app/dashboard/page.tsx
git commit -m "feat: wire daily rings widget and quick-log FAB into dashboard"
```
