# Workout activity picker + AI food/workout calorie estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen workout logging to a full common-activity list with optional distance and a real "Other" description path, add a text-based AI calorie estimate for food, and make the structured-session cardio loggers persist calories like the quick-log flow already does.

**Architecture:** A new shared `lib/workoutActivities.ts` module centralizes the activity list and a notes-formatting helper. The existing `estimate-workout-calories` API route gains two optional fields; a new `estimate-food-calories` route mirrors the existing `scan-food` route but is text-only. Three dashboard/session UI components are updated to use these; three session-logger components are updated to emit a standardized `{ activityType, durationMinutes, distanceKm?, caloriesBurned, notes? }` shape from `onEnd`, and `CompletionTracker` writes that into `calorie_burns` alongside its existing `sessions` insert.

**Tech Stack:** Next.js 15 (App Router), TypeScript (strict), Supabase (`@supabase/auth-helpers-nextjs`), OpenRouter via the `openai` SDK, Radix UI (`@/components/ui/*`), no automated test framework — pure-logic modules use the repo's `*.selftest.ts` convention (plain assertion scripts run with `npx tsx`); UI/API changes are verified with `npx tsc --noEmit` plus manual end-to-end passes through the running app.

## Global Constraints

- No database schema migrations — `calorie_burns.notes` and `food_intakes.notes` (both nullable `text`) hold distance/description/itemization instead of new columns.
- Duration remains the primary calorie-calculation driver for workouts; distance is optional estimate-quality context only.
- `activityType === 'Other'` requires a non-empty description, enforced both client-side and server-side.
- Strength session loggers (`PushPullLegLogger`, `FullBodyLogger`, `BodyweightLogger`, `RestLogger`) are out of scope — do not modify them.
- Goals-page components (`CalorieTracker`, `FoodIntakeTracker`, `FoodScanner`) are out of scope — they read existing tables and need no changes.
- Follow existing per-file UI conventions: `LogWorkoutModal`/`LogCaloriesModal` use native `<select>` and shadcn `Tabs`; `OutdoorCardioLogger`/`ActiveCommuteLogger` use the Radix `Select` wrapper (`@/components/ui/select`) — match whichever a file already uses rather than introducing a third pattern.

---

## File Structure

- **Create** `lib/workoutActivities.ts` — `COMMON_ACTIVITIES` list + `formatWorkoutNotes()` helper. Shared by every workout-logging surface.
- **Create** `lib/workoutActivities.selftest.ts` — assertion script for `formatWorkoutNotes()`.
- **Modify** `app/api/ai/estimate-workout-calories/route.ts` — accept `distanceKm`/`description`, adjust prompt and validation.
- **Modify** `app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal.tsx` — full activity list, distance field, Other+description, richer AI call.
- **Create** `app/api/ai/estimate-food-calories/route.ts` — text-based AI food estimate, mirrors `scan-food/route.ts`.
- **Modify** `app/(burnlog)/dashboard/_components/quick-log/LogCaloriesModal.tsx` — add "Describe (AI)" tab.
- **Modify** `app/(burnlog)/session/_components/session-loggers/CardioLogger.tsx` — full rewrite to the shared activity/distance/AI pattern.
- **Modify** `app/(burnlog)/session/_components/session-loggers/OutdoorCardioLogger.tsx` — add AI calorie estimate, standardize `onEnd` payload.
- **Modify** `app/(burnlog)/session/_components/session-loggers/ActiveCommuteLogger.tsx` — pass through its already-computed calorie estimate, standardize `onEnd` payload.
- **Modify** `app/(burnlog)/session/_components/CompletionTracker.tsx` — insert into `calorie_burns` when `exerciseLog.caloriesBurned` is present.

---

### Task 1: Shared activity list and notes formatter

**Files:**
- Create: `lib/workoutActivities.ts`
- Test: `lib/workoutActivities.selftest.ts`

**Interfaces:**
- Produces: `COMMON_ACTIVITIES: readonly string[]` (last entry is always `'Other'`), `formatWorkoutNotes(distanceKm?: number, description?: string): string | null`. Every later task that touches workout logging imports these from `@/lib/workoutActivities`.

- [ ] **Step 1: Write the failing test**

Create `lib/workoutActivities.selftest.ts`:

```ts
// lib/workoutActivities.selftest.ts
export {};

async function main() {
  const { COMMON_ACTIVITIES, formatWorkoutNotes } = await import('./workoutActivities');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  assert(COMMON_ACTIVITIES.length >= 10, 'COMMON_ACTIVITIES has a broad set of options');
  assert(COMMON_ACTIVITIES[COMMON_ACTIVITIES.length - 1] === 'Other', 'Other is always the last option');
  assert(COMMON_ACTIVITIES.includes('Running'), 'includes Running');
  assert(COMMON_ACTIVITIES.includes('Swimming'), 'includes Swimming');
  assert(COMMON_ACTIVITIES.includes('Badminton'), 'includes Badminton');
  assert(COMMON_ACTIVITIES.includes('Soccer'), 'includes Soccer');
  assert(new Set(COMMON_ACTIVITIES).size === COMMON_ACTIVITIES.length, 'no duplicate activities');

  assert(formatWorkoutNotes(undefined, undefined) === null, 'no distance/description -> null');
  assert(formatWorkoutNotes(5.2, undefined) === 'Distance: 5.2 km', 'distance only');
  assert(formatWorkoutNotes(undefined, 'Played pickup basketball') === 'Played pickup basketball', 'description only');
  assert(
    formatWorkoutNotes(3, 'Backyard obstacle course') === 'Distance: 3 km\nBackyard obstacle course',
    'distance and description combine with a newline'
  );
  assert(formatWorkoutNotes(0, undefined) === null, 'zero distance is treated as absent');
  assert(formatWorkoutNotes(undefined, '   ') === null, 'whitespace-only description is treated as absent');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll workoutActivities assertions passed');
}

main();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/workoutActivities.selftest.ts`
Expected: FAIL — `Cannot find module './workoutActivities'` (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/workoutActivities.ts`:

```ts
// lib/workoutActivities.ts

export const COMMON_ACTIVITIES = [
  'Gym / Weights',
  'Running',
  'Walking',
  'Cycling',
  'Swimming',
  'Hiking',
  'Yoga',
  'HIIT',
  'Rowing',
  'Elliptical',
  'Basketball',
  'Soccer',
  'Badminton',
  'Tennis',
  'Dancing',
  'Other',
] as const;

export type CommonActivity = (typeof COMMON_ACTIVITIES)[number];

export function formatWorkoutNotes(distanceKm?: number, description?: string): string | null {
  const parts: string[] = [];

  if (distanceKm && distanceKm > 0) {
    parts.push(`Distance: ${distanceKm} km`);
  }

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    parts.push(trimmedDescription);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/workoutActivities.selftest.ts`
Expected: PASS — all `OK:` lines, ending with `All workoutActivities assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/workoutActivities.ts lib/workoutActivities.selftest.ts
git commit -m "feat: add shared common-activities list and workout notes formatter"
```

---

### Task 2: Extend `estimate-workout-calories` API with distance and description

**Files:**
- Modify: `app/api/ai/estimate-workout-calories/route.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `POST /api/ai/estimate-workout-calories` now accepts `{ activityType: string; durationMinutes: number; distanceKm?: number; description?: string }` and still returns `{ caloriesBurned: number; notes: string }` on success or `{ error: string }` with a non-2xx status. `LogWorkoutModal` (Task 3) and `CardioLogger`/`OutdoorCardioLogger` (Tasks 6–7) call it with these fields.

- [ ] **Step 1: Replace the route body validation and prompt**

Edit `app/api/ai/estimate-workout-calories/route.ts`. Replace lines 24–55 (the body-parsing through prompt-construction block) with:

```ts
    const body = await request.json();
    const { activityType, durationMinutes, distanceKm, description } = body as {
      activityType?: string;
      durationMinutes?: number;
      distanceKm?: number;
      description?: string;
    };

    if (!activityType || !durationMinutes || durationMinutes <= 0) {
      return NextResponse.json({ error: 'activityType and a positive durationMinutes are required' }, { status: 400 });
    }

    if (activityType === 'Other' && !description?.trim()) {
      return NextResponse.json({ error: 'description is required when activityType is Other' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('weight, age')
      .eq('userId', user.id)
      .single();

    const weight = profile?.weight ?? 70;
    const age = profile?.age ?? 30;

    const activityLine = activityType === 'Other'
      ? `Activity: unspecified — infer the actual activity from this description: "${description?.trim()}"`
      : `Activity: ${activityType}`;

    const paceLine = distanceKm && distanceKm > 0
      ? `\nDistance covered: ${distanceKm} km in ${durationMinutes} minutes (use this pace to judge intensity).`
      : '';

    const prompt = `You are an exercise physiologist estimating calorie expenditure.

${activityLine}
Duration: ${durationMinutes} minutes${paceLine}
User: ${weight} kg, ${age} years old

If the activity was inferred from a description, briefly name the inferred activity in your notes.
Use a MET-based estimate appropriate for this activity type and duration, adjusted for the user's body weight and, if distance/pace was given, adjusted for intensity implied by that pace.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "caloriesBurned": <integer estimate of total kcal burned for the full duration>,
  "notes": "one short sentence explaining the estimate (e.g. MET value used, inferred activity if applicable)"
}`;
```

The rest of the file (the `client.chat.completions.create` call through the final `catch` block) is unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/estimate-workout-calories/route.ts
git commit -m "feat: support distance and Other-description context in workout calorie estimate"
```

---

### Task 3: Rebuild `LogWorkoutModal` with the full activity list, distance, and Other-description

**Files:**
- Modify: `app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal.tsx`

**Interfaces:**
- Consumes: `COMMON_ACTIVITIES`, `formatWorkoutNotes` from `@/lib/workoutActivities` (Task 1); `POST /api/ai/estimate-workout-calories` extended body (Task 2).
- Produces: no external consumers — this is a leaf UI component rendered by the dashboard quick-log FAB.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { COMMON_ACTIVITIES, formatWorkoutNotes } from '@/lib/workoutActivities';

type LogWorkoutModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogWorkoutModal({ profileId, onClose, onSaved }: LogWorkoutModalProps) {
  const supabase = createClientComponentClient();
  const [activityType, setActivityType] = useState<string>(COMMON_ACTIVITIES[0]);
  const [duration, setDuration] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [description, setDescription] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = activityType === 'Other';

  const handleEstimate = async () => {
    setError(null);
    if (!duration || isNaN(Number(duration)) || Number(duration) <= 0) {
      setError('Enter a valid duration first');
      return;
    }
    if (isOther && !description.trim()) {
      setError('Briefly describe what you did first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-workout-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType,
          durationMinutes: Number(duration),
          distanceKm: distanceKm ? Number(distanceKm) : undefined,
          description: isOther ? description.trim() : undefined,
        }),
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
    if (isOther && !description.trim()) {
      setError('Briefly describe what you did');
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
          notes: formatWorkoutNotes(distanceKm ? Number(distanceKm) : undefined, isOther ? description : undefined),
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
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Workout</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <Label htmlFor="activityType">Workout Type</Label>
            <select
              id="activityType"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              {COMMON_ACTIVITIES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="duration">Duration (mins)</Label>
              <Input id="duration" type="number" placeholder="Minutes" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="distanceKm">Distance (km) — optional</Label>
              <Input
                id="distanceKm"
                type="number"
                step="0.1"
                placeholder="e.g. 5.2"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
            </div>
          </div>

          {isOther && (
            <div className="space-y-1">
              <Label htmlFor="description">Briefly describe what you did</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 border rounded-md h-16 text-sm"
                placeholder="e.g. 30 min bodyweight circuit: squats, push-ups, lunges"
              />
            </div>
          )}

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
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open the dashboard, tap the quick-log FAB → "Log Workout". Confirm: the dropdown lists all 16 activities ending in "Other"; picking "Other" reveals the description textarea and blocks Save/AI until filled; entering a duration + tapping "AI" returns a calorie estimate; Save succeeds and the new row appears (check via Supabase dashboard or the `calorie_burns` table) with `notes` containing the distance/description when provided.

- [ ] **Step 4: Commit**

```bash
git add app/\(burnlog\)/dashboard/_components/quick-log/LogWorkoutModal.tsx
git commit -m "feat: expand Log Workout with full activity list, distance, and Other description"
```

---

### Task 4: New `estimate-food-calories` API route

**Files:**
- Create: `app/api/ai/estimate-food-calories/route.ts`

**Interfaces:**
- Consumes: `getModel` from `@/lib/ai/modelConfig`, `formatAiError` from `@/lib/ai/errors` (both pre-existing, used identically to `scan-food/route.ts`).
- Produces: `POST /api/ai/estimate-food-calories` accepting `{ description: string; mealType?: string }`, returning `{ foodName: string; calories: number; protein: number; carbs: number; fat: number; fiber: number; items: { name: string; calories: number }[]; confidence: string; notes: string; mealType: string }` on success, or `{ error: string }` with non-2xx status. Consumed by `LogCaloriesModal` (Task 5).

- [ ] **Step 1: Write the route**

Create `app/api/ai/estimate-food-calories/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    MODEL = await getModel(supabase, 'text');

    const body = await request.json();
    const { description, mealType = 'meal' } = body as {
      description?: string;
      mealType?: string;
    };

    if (!description?.trim()) {
      return NextResponse.json({ error: 'No food description provided' }, { status: 400 });
    }

    const prompt = `You are a nutrition expert estimating calories and macros from a text description of a meal.

The description may list multiple items separated by "+", commas, "and", or line breaks — for example "coffee + pancake + a banana". Identify each distinct item, estimate its calories and macros using a typical/average serving size unless the description gives a size, then sum the totals.

Meal description: "${description.trim()}"

Return ONLY a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "foodName": "short combined summary of all items, e.g. 'Coffee, pancake, banana'",
  "calories": <number — total estimated kcal across all items>,
  "protein": <number — total grams of protein>,
  "carbs": <number — total grams of carbohydrates>,
  "fat": <number — total grams of fat>,
  "fiber": <number — total grams of fiber, or 0>,
  "items": [{"name": "item name", "calories": <number>}, ...one entry per distinct item],
  "confidence": "high" | "medium" | "low",
  "notes": "any assumptions made (e.g. serving sizes assumed)"
}

If the description does not describe any food, return:
{"error": "No food described"}

Be realistic with estimates.`;

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

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    const calories = Number(result.calories ?? 0);
    if (!calories || Number.isNaN(calories) || calories <= 0) {
      return NextResponse.json({ error: 'AI response missing a valid calorie estimate' }, { status: 502 });
    }

    const items = Array.isArray(result.items)
      ? (result.items as Array<Record<string, unknown>>)
          .map((item) => ({ name: String(item.name ?? ''), calories: Number(item.calories ?? 0) }))
          .filter((item) => item.name.length > 0)
      : [];

    return NextResponse.json({
      foodName: result.foodName ?? 'Unknown food',
      calories: Math.round(calories),
      protein: Number(result.protein ?? 0),
      carbs: Number(result.carbs ?? 0),
      fat: Number(result.fat ?? 0),
      fiber: Number(result.fiber ?? 0),
      items,
      confidence: result.confidence ?? 'medium',
      notes: result.notes ?? '',
      mealType,
    });
  } catch (error) {
    console.error('estimate-food-calories error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/estimate-food-calories/route.ts
git commit -m "feat: add text-based AI food calorie estimate endpoint"
```

---

### Task 5: Add "Describe (AI)" tab to `LogCaloriesModal`

**Files:**
- Modify: `app/(burnlog)/dashboard/_components/quick-log/LogCaloriesModal.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/estimate-food-calories` from Task 4, returning `{ foodName, calories, protein, carbs, fat, items: {name, calories}[], notes, mealType }`.
- Produces: no external consumers — leaf UI component.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/(burnlog)/dashboard/_components/quick-log/LogCaloriesModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { FoodScanner } from '@/app/(burnlog)/goals/_components/FoodScanner';

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
  const [tab, setTab] = useState<'manual' | 'describe' | 'photo'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [itemsNote, setItemsNote] = useState('');
  const [foodDescription, setFoodDescription] = useState('');
  const [estimating, setEstimating] = useState(false);
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
    setItemsNote('');
    if (result.mealType) setMealType(result.mealType);
    setShowScanner(false);
    setTab('manual');
  };

  const handleDescribeEstimate = async () => {
    setError(null);
    if (!foodDescription.trim()) {
      setError('Describe what you ate first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-food-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: foodDescription.trim(), mealType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to estimate calories. Enter manually.');
        return;
      }
      setFoodName(data.foodName);
      setCalories(String(data.calories));
      setProtein(String(data.protein));
      setCarbs(String(data.carbs));
      setFat(String(data.fat));
      const items = data.items as { name: string; calories: number }[] | undefined;
      setItemsNote(items?.length ? items.map((i) => `${i.name} (${i.calories} kcal)`).join(', ') : '');
      setTab('manual');
    } catch {
      setError('Network error. Enter calories manually.');
    } finally {
      setEstimating(false);
    }
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
          notes: itemsNote || null,
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
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Calories</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'describe' | 'photo')}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="describe">Describe (AI)</TabsTrigger>
              <TabsTrigger value="photo">Photo (AI)</TabsTrigger>
            </TabsList>
            <TabsContent value="describe" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label htmlFor="foodDescription">What did you eat?</Label>
                <textarea
                  id="foodDescription"
                  value={foodDescription}
                  onChange={(e) => setFoodDescription(e.target.value)}
                  className="w-full p-2 border rounded-md h-20 text-sm"
                  placeholder="e.g. coffee, 2 pancakes, a banana"
                />
              </div>
              <Button className="w-full" onClick={handleDescribeEstimate} disabled={estimating}>
                {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Estimate with AI'}
              </Button>
              <p className="text-xs text-muted-foreground">
                List multiple items separated by commas or "+" — AI estimates calories and macros for each, then you can review and save below.
              </p>
            </TabsContent>
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
              {itemsNote && <p className="text-xs text-muted-foreground">Items: {itemsNote}</p>}
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open the dashboard quick-log FAB → "Log Calories" → "Describe (AI)" tab. Type "coffee, 2 pancakes, a banana", tap "Estimate with AI", confirm it switches to Manual with fields pre-filled and an "Items:" line listing the breakdown. Save and confirm the row lands in `food_intakes` with `notes` containing the item breakdown.

- [ ] **Step 4: Commit**

```bash
git add app/\(burnlog\)/dashboard/_components/quick-log/LogCaloriesModal.tsx
git commit -m "feat: add text-based AI calorie estimate tab to Log Calories"
```

---

### Task 6: Rewrite `CardioLogger` with the shared activity picker and AI calorie estimate

**Files:**
- Modify: `app/(burnlog)/session/_components/session-loggers/CardioLogger.tsx`

**Interfaces:**
- Consumes: `COMMON_ACTIVITIES`, `formatWorkoutNotes` from `@/lib/workoutActivities` (Task 1); `POST /api/ai/estimate-workout-calories` (Task 2).
- Produces: `onEnd(log: { activityType: string; durationMinutes: number; distanceKm?: number; caloriesBurned: number; notes?: string })` — this exact shape is relied on by `CompletionTracker` (Task 9).

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/(burnlog)/session/_components/session-loggers/CardioLogger.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMMON_ACTIVITIES, formatWorkoutNotes } from '@/lib/workoutActivities';

type CardioLoggerProps = {
  onEnd: (log: {
    activityType: string;
    durationMinutes: number;
    distanceKm?: number;
    caloriesBurned: number;
    notes?: string;
  }) => void;
};

export function CardioLogger({ onEnd }: CardioLoggerProps) {
  const [activityType, setActivityType] = useState<string>(COMMON_ACTIVITIES[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = activityType === 'Other';
  const sessionSuccess = durationMinutes > 0 && !!caloriesBurned && !isNaN(Number(caloriesBurned));

  const handleEstimate = async () => {
    setError(null);
    if (durationMinutes <= 0) {
      setError('Enter a valid duration first');
      return;
    }
    if (isOther && !description.trim()) {
      setError('Briefly describe what you did first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-workout-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType,
          durationMinutes,
          distanceKm: distanceKm > 0 ? distanceKm : undefined,
          description: isOther ? description.trim() : undefined,
        }),
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

  const handleFinish = () => {
    onEnd({
      activityType,
      durationMinutes,
      distanceKm: distanceKm > 0 ? distanceKm : undefined,
      caloriesBurned: Number(caloriesBurned),
      notes: formatWorkoutNotes(distanceKm > 0 ? distanceKm : undefined, isOther ? description : undefined) ?? undefined,
    });
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Cardio Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Activity</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMON_ACTIVITIES.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={0}
                value={durationMinutes || ''}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-2">
              <Label>Distance (km) — optional</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={distanceKm || ''}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                placeholder="e.g. 5.2"
              />
            </div>
          </div>

          {isOther && (
            <div className="space-y-2">
              <Label>Briefly describe what you did</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 border rounded-md h-16 text-sm"
                placeholder="e.g. 30 min bodyweight circuit: squats, push-ups, lunges"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Calories burned</Label>
            <div className="flex gap-2">
              <Input
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

          <div className="flex justify-end">
            <Button onClick={handleFinish} disabled={!sessionSuccess}>
              Finish Cardio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: this drops the old per-exercise checkbox list and its `ExerciseInfoModal`/`getExerciseImage` "how to do it" affordance in favor of a single activity select, matching the quick-log pattern the design calls for. If any other file imports `ExerciseInfoModal` or `getExerciseImage` for other reasons, this task does not touch those — only `CardioLogger.tsx`'s own use of them goes away.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(burnlog\)/session/_components/session-loggers/CardioLogger.tsx
git commit -m "feat: rewrite CardioLogger with shared activity picker and AI calorie estimate"
```

---

### Task 7: Add calorie estimate to `OutdoorCardioLogger`, standardize `onEnd`

**Files:**
- Modify: `app/(burnlog)/session/_components/session-loggers/OutdoorCardioLogger.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/estimate-workout-calories` (Task 2).
- Produces: `onEnd(log: { activityType: string; durationMinutes: number; distanceKm?: number; caloriesBurned: number; notes?: string })` — same shape as `CardioLogger`, relied on by `CompletionTracker` (Task 9). Note this replaces the old payload shape (`{ activityType, durationMinutes, distanceKm, notes, extras }`) — the `extras` checkboxes are folded into `notes` instead of a separate field.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/(burnlog)/session/_components/session-loggers/OutdoorCardioLogger.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { Loader2, TreePine } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { LifestyleAnswers } from '@/lib/ai/types';

type OutdoorCardioLoggerProps = {
  lifestyle?: LifestyleAnswers | null;
  onEnd: (log: {
    activityType: string;
    durationMinutes: number;
    distanceKm?: number;
    caloriesBurned: number;
    notes?: string;
  }) => void;
};

const BASE_ACTIVITIES = ['Running', 'Cycling', 'Brisk Walking', 'Hiking', 'Outdoor HIIT', 'Swimming'];
const EXTRAS = ['Warm-up stretch', 'Cool-down stretch', 'Hill intervals', 'Sprint intervals', 'Fasted'];

export function OutdoorCardioLogger({ lifestyle, onEnd }: OutdoorCardioLoggerProps) {
  const hasOutdoorSpace = lifestyle?.equipment?.homeEnvironment?.hasOutdoorSpace;
  const nearbyPark = lifestyle?.equipment?.homeEnvironment?.nearbyPark;

  // Suggest activities based on what the user has access to
  const activities = [
    ...BASE_ACTIVITIES,
    ...(hasOutdoorSpace ? ['Garden HIIT Circuit', 'Backyard Sprint Intervals'] : []),
    ...(nearbyPark ? ['Park Trail Run', 'Park Bench Workout', 'Outdoor Yoga'] : []),
  ];

  const [activityType, setActivityType] = useState(activities[0]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [distanceKm, setDistanceKm] = useState(0);
  const [notes, setNotes] = useState('');
  const [extras, setExtras] = useState<Record<string, boolean>>(
    Object.fromEntries(EXTRAS.map((e) => [e, false]))
  );
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleExtra = (key: string) =>
    setExtras((prev) => ({ ...prev, [key]: !prev[key] }));

  const sessionSuccess = durationMinutes > 0 && !!caloriesBurned && !isNaN(Number(caloriesBurned));

  const buildNotes = () => {
    const activeExtras = Object.entries(extras).filter(([, v]) => v).map(([k]) => k);
    return [notes.trim(), activeExtras.length ? `Extras: ${activeExtras.join(', ')}` : '']
      .filter(Boolean)
      .join('\n') || undefined;
  };

  const handleEstimate = async () => {
    setError(null);
    if (durationMinutes <= 0) {
      setError('Enter a valid duration first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-workout-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType,
          durationMinutes,
          distanceKm: distanceKm > 0 ? distanceKm : undefined,
        }),
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

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TreePine className="h-5 w-5" />
            Outdoor Cardio
          </CardTitle>
          <p className="text-sm text-muted-foreground">Log your outdoor session</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Activity</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-2">
              <Label>Distance (km) — optional</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={distanceKm || ''}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                placeholder="e.g. 5.2"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Extras</Label>
            <div className="grid grid-cols-2 gap-2">
              {EXTRAS.map((ex) => (
                <label key={ex} className="flex items-center space-x-2">
                  <Checkbox checked={extras[ex]} onCheckedChange={() => toggleExtra(ex)} />
                  <span className="text-sm">{ex}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded-md h-16 text-sm"
              placeholder="How did it feel? Any highlights?"
            />
          </div>

          {durationMinutes > 0 && distanceKm > 0 && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-center">
              Avg pace: {(durationMinutes / distanceKm).toFixed(1)} min/km
            </div>
          )}

          <div className="space-y-2">
            <Label>Calories burned</Label>
            <div className="flex gap-2">
              <Input
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

          <div className="flex justify-end">
            <Button
              onClick={() =>
                onEnd({
                  activityType,
                  durationMinutes,
                  distanceKm: distanceKm > 0 ? distanceKm : undefined,
                  caloriesBurned: Number(caloriesBurned),
                  notes: buildNotes(),
                })
              }
              disabled={!sessionSuccess}
            >
              Finish Outdoor Session
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(burnlog\)/session/_components/session-loggers/OutdoorCardioLogger.tsx
git commit -m "feat: add AI calorie estimate to OutdoorCardioLogger, standardize onEnd payload"
```

---

### Task 8: Pass through the computed estimate in `ActiveCommuteLogger`, standardize `onEnd`

**Files:**
- Modify: `app/(burnlog)/session/_components/session-loggers/ActiveCommuteLogger.tsx`

**Interfaces:**
- Consumes: nothing new — reuses the component's existing formula-based `caloriesEstimate`.
- Produces: `onEnd(log: { activityType: string; durationMinutes: number; distanceKm?: number; caloriesBurned: number; notes?: string })` — same shape as Tasks 6–7, relied on by `CompletionTracker` (Task 9). Replaces the old payload shape (`{ mode, trips, distanceKmPerTrip, durationMinutesPerTrip, notes }`).

- [ ] **Step 1: Update the type and the `onEnd` call site**

Edit `app/(burnlog)/session/_components/session-loggers/ActiveCommuteLogger.tsx`. Replace the `onEnd` type in the props (lines 15–22):

```ts
type ActiveCommuteLoggerProps = {
  commuteDetails?: CommuteDetails;
  onEnd: (log: {
    activityType: string;
    durationMinutes: number;
    distanceKm?: number;
    caloriesBurned: number;
    notes?: string;
  }) => void;
};
```

Then replace the final `Button` block's `onClick` (originally around line 147–150):

```tsx
            <Button
              onClick={() =>
                onEnd({
                  activityType: mode === 'cycle' ? 'Cycling' : 'Walking',
                  durationMinutes: totalDuration,
                  distanceKm: totalDistance > 0 ? totalDistance : undefined,
                  caloriesBurned: caloriesEstimate,
                  notes: notes.trim() || undefined,
                })
              }
              disabled={distanceKmPerTrip <= 0 || durationMinutesPerTrip <= 0}
            >
              Log Commute
              <CheckCircle2 className="ml-2 h-4 w-4" />
            </Button>
```

No other lines in the file change — `mode`, `trips`, `distanceKmPerTrip`, `durationMinutesPerTrip`, `totalDistance`, `totalDuration`, `caloriesEstimate`, and `notes` all already exist as local state/derived values.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(burnlog\)/session/_components/session-loggers/ActiveCommuteLogger.tsx
git commit -m "fix: pass computed calorie estimate through ActiveCommuteLogger onEnd, standardize payload"
```

---

### Task 9: Persist calories from cardio sessions in `CompletionTracker`

**Files:**
- Modify: `app/(burnlog)/session/_components/CompletionTracker.tsx`

**Interfaces:**
- Consumes: `exerciseLog` shape from Tasks 6–8 — specifically checks for a numeric `exerciseLog.caloriesBurned`, and reads `exerciseLog.activityType` (string) and `exerciseLog.durationMinutes` (number) when present. Strength-logger `exerciseLog` objects never have `caloriesBurned`, so this branch is skipped for them.
- Produces: no new exports — this is the terminal consumer in the chain.

- [ ] **Step 1: Add the `calorie_burns` insert**

Edit `app/(burnlog)/session/_components/CompletionTracker.tsx`. In `handleSubmit`, right after the existing `sessions` insert succeeds (after the `if (error) { ... return; }` block that follows the `supabase.from('sessions').insert(...)` call, i.e. after line 98 in the current file), add:

```ts
      const caloriesBurned = exerciseLog?.caloriesBurned;
      if (typeof caloriesBurned === 'number' && caloriesBurned > 0) {
        const { error: calorieError } = await supabase.from('calorie_burns').insert([
          {
            profileId: profileData.id,
            activityType: typeof exerciseLog?.activityType === 'string' ? exerciseLog.activityType : plan.bodyPart,
            duration: typeof exerciseLog?.durationMinutes === 'number' ? exerciseLog.durationMinutes : duration,
            caloriesBurned,
            notes: typeof exerciseLog?.notes === 'string' ? exerciseLog.notes : null,
          },
        ]);
        if (calorieError) {
          console.error('Error saving calorie burn:', calorieError);
        }
      }
```

This runs before the `if (completed) { ... }` streak/XP block, so it fires regardless of whether the user marks the session completed (matching the existing `sessions` insert, which also fires unconditionally). A failed calorie insert is logged but does not block the streak/XP flow or the success toast — the workout is still saved either way.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, navigate to a plan day with body part "Cardio" (or set one up via the plan calendar), complete a Cardio session end-to-end (pick an activity, enter duration, tap AI to estimate calories, Finish Cardio, then Complete Workout). Confirm both a new `sessions` row and a new `calorie_burns` row appear. Repeat for an "Outdoor Cardio" and "Active Commute" plan day if configured. Then complete a strength session (e.g. "Push" day) and confirm only a `sessions` row is created, with no error.

- [ ] **Step 4: Commit**

```bash
git add app/\(burnlog\)/session/_components/CompletionTracker.tsx
git commit -m "feat: persist calorie burns from structured cardio session completions"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (shared list/notes helper) → Task 1. Section 2 (`LogWorkoutModal`) → Task 3. Section 3 (`estimate-workout-calories`) → Task 2. Section 4 (`LogCaloriesModal` Describe tab) → Task 5. Section 5 (`estimate-food-calories`) → Task 4. Section 6 (`CardioLogger` rewrite) → Task 6. Section 7 (`OutdoorCardioLogger`/`ActiveCommuteLogger` parity) → Tasks 7–8. Section 8 (`CompletionTracker` persistence) → Task 9. All eight spec sections are covered.
- **Placeholder scan:** No TBD/TODO markers; every step has complete, pasteable code or an exact command with expected output.
- **Type consistency:** `onEnd` payload shape `{ activityType: string; durationMinutes: number; distanceKm?: number; caloriesBurned: number; notes?: string }` is identical across Tasks 6, 7, and 8, and matches what Task 9's `CompletionTracker` reads. `COMMON_ACTIVITIES`/`formatWorkoutNotes` signatures from Task 1 are used identically in Tasks 3, 6, and 7 (Task 7 doesn't use `formatWorkoutNotes` since it builds its own `buildNotes()` to fold in the `extras` checkboxes — this is intentional, noted in Task 7's step).
