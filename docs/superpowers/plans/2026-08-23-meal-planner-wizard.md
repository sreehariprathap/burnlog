# Meal Planner Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, repeatable Meal Planner wizard (store/manual pantry → household size/cook mode → cuisine prefs → appliances → AI meal candidates → weekly grid with swap → grocery list → shopping-day reminder), plus the onboarding question and recurring/one-off notification infra that makes it a weekly habit.

**Architecture:** Three phases. Phase 1 adds the wizard itself as a new route (`/meal-planner`) with its own two AI endpoints (`candidates`, `finalize`), reusing the existing `MealPlanEntry` table for the final grid. Phase 2 adds `GroceryList` + a generic `ScheduledReminder` model and a polling cron (`/api/cron/scheduled-reminders`) that handles both one-off and weekly-recurring pushes. Phase 3 wires a new onboarding question into the existing `AiSetupFlow`, and adds a dashboard banner driven by `Profile.mealPrepDayOfWeek`/`lastMealPlanGeneratedAt`.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (`@supabase/auth-helpers-nextjs` client-side, `createServiceRoleClient` for the cron), Prisma (schema-only, `db push`), `openai` SDK against OpenRouter, existing `components/ui/*` (Card, Button, Select, Checkbox, Input, Label), `components/kokonutui/ai-loading.tsx`.

**Spec:** `docs/superpowers/specs/2026-08-23-meal-planner-wizard-design.md`

## Global Constraints

- No test framework in this repo — verification is `npx tsc --noEmit` + `npx next build` + manual walkthrough, plus `mcp__supabase__list_tables` to confirm RLS on every new table.
- Schema changes via `npx prisma db push` (no migrations directory). RLS applied via `mcp__supabase__apply_migration` against the live project, mirrored into `supabase/rls.sql` — same two-step pattern used for every prior schema change in this repo.
- **Correction to the spec's wording:** the spec says the new `candidates`/`finalize` routes "replace" `app/api/ai/meal-plan/route.ts`. That route is still the generate button wired into `MealChecklist.tsx` (`app/(burnlog)/session/_components/MealChecklist.tsx`) on the existing Plan page — deleting it would break that shipped feature. This plan instead **adds** `candidates`/`finalize` as new routes alongside the untouched original. Both write to the same `meal_plan_entries` table via the same upsert contract, so they stay interchangeable from the Plan page's point of view.
- `MealCandidate`, `MealGridCell`, `MealPlannerWizardAnswers`, `CUISINE_STYLES`, `KITCHEN_APPLIANCES`, `MANUAL_INGREDIENTS_OPTION` all live in `lib/ai/types.ts` (Task 2) — every later task imports from there, never redefines locally.
- Multi-select UI follows the existing `EquipmentStep.tsx` pattern: a `toggle(value)` helper over a `string[]` state, rendered as a `Checkbox` + label grid — no new shared abstraction, matches repo convention.
- Native `<input type="date">` / `<input type="time">` for date/time entry — no date-picker library exists in this repo and none is being added.

---

## Phase 1: Wizard core

### Task 1: Prisma schema — Profile fields, `GroceryList`, `ScheduledReminder`, RLS

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Produces: `profiles` columns `mealPrepDayOfWeek`, `mealPrepTime`, `mealPrepTimezone`, `lastMealPlanGeneratedAt`; tables `grocery_lists` (`id, profileId, items, estimatedBudget, shoppingAt, createdAt, updatedAt`, unique on `profileId`) and `scheduled_reminders` (`id, profileId, title, message, url, remindAt, dayOfWeek, timeOfDay, timezone, lastSentAt, sentAt, createdAt`), all RLS-protected like every other `profileId`-keyed table.

- [ ] **Step 1: Add the new `Profile` columns and relations**

In `prisma/schema.prisma`, in the `Profile` model, change:

```prisma
  waterUnit                String    @default("glasses")
  glassSizeMl              Int       @default(250)
  waterGoalMl              Int       @default(2000)
  username                 String    @unique
```

to:

```prisma
  waterUnit                String    @default("glasses")
  glassSizeMl              Int       @default(250)
  waterGoalMl              Int       @default(2000)
  username                 String    @unique
  mealPrepDayOfWeek        Int?
  mealPrepTime             String?
  mealPrepTimezone         String?
  lastMealPlanGeneratedAt  DateTime?
```

and change:

```prisma
  MealPlanEntry      MealPlanEntry[]
  MealPlanCheckIn    MealPlanCheckIn[]
```

to:

```prisma
  MealPlanEntry      MealPlanEntry[]
  MealPlanCheckIn    MealPlanCheckIn[]
  GroceryList        GroceryList[]
  ScheduledReminder  ScheduledReminder[]
```

- [ ] **Step 2: Append the two new models**

Add at the true end of `prisma/schema.prisma`:

```prisma
/// this week's generated grocery list — one active row per profile, upserted per wizard run
model GroceryList {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile   @relation(fields: [profileId], references: [id])
  profileId       String    @unique @db.Uuid
  items           Json
  estimatedBudget String?
  shoppingAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("grocery_lists")
}

/// generic scheduled push: one-off (remindAt set) or weekly-recurring (dayOfWeek+timeOfDay+timezone set)
model ScheduledReminder {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id])
  profileId   String    @db.Uuid
  title       String
  message     String
  url         String
  remindAt    DateTime?
  dayOfWeek   Int?
  timeOfDay   String?
  timezone    String?
  lastSentAt  DateTime? @db.Date
  sentAt      DateTime?
  createdAt   DateTime  @default(now())

  @@map("scheduled_reminders")
}
```

- [ ] **Step 3: Push the schema and regenerate the client**

Run: `npx prisma db push`
Expected: ends with "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Add RLS policies via the live Supabase connection**

Use `mcp__supabase__apply_migration` with `name: "meal_planner_rls"` and this `query`:

```sql
do $$
declare
  t text;
begin
  foreach t in array array[
    'grocery_lists',
    'scheduled_reminders'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for all
        using (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
    $f$, t || '_owner_access', t, t, t);
  end loop;
end $$;
```

Expected: applies with no errors. Verify with `mcp__supabase__list_tables` (schemas: `["public"]`, verbose: `false`) — confirm both tables show `"rls_enabled": true`.

- [ ] **Step 5: Mirror into `supabase/rls.sql`**

Change the `foreach t in array array[...]` list ending in `'meal_plan_entries', 'meal_plan_checkins'` to also include:

```sql
    'meal_plan_entries',
    'meal_plan_checkins',
    'grocery_lists',
    'scheduled_reminders'
  ]
```

- [ ] **Step 6: Verify build**

Run: `npx next build`
Expected: succeeds (new tables/columns aren't referenced by any code yet).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add meal-planner schema (Profile fields, GroceryList, ScheduledReminder)"
```

---

### Task 2: Shared types — `lib/ai/types.ts`

**Files:**
- Modify: `lib/ai/types.ts`

**Interfaces:**
- Produces: `CUISINE_STYLES`, `KITCHEN_APPLIANCES`, `MANUAL_INGREDIENTS_OPTION`, `MealCandidate`, `MealGridCell`, `MealPlanningAnswers`, extended `GROCERY_STORES`, extended `LifestyleAnswers` (`mealPlanning?`). All consumed by Tasks 3–15.

- [ ] **Step 1: Extend `GROCERY_STORES` and add `MANUAL_INGREDIENTS_OPTION`**

Change:

```ts
export const GROCERY_STORES = [
  // North America
  'Walmart', 'Target', 'Costco', 'Kroger', 'Whole Foods', "Trader Joe's",
  'Aldi', 'Safeway', 'Publix', 'H-E-B', 'Wegmans', 'Meijer', 'Food Lion',
  // Canada
  'Loblaws', "No Frills", 'FreshCo', 'Sobeys', 'Metro', 'Real Canadian Superstore',
  // UK / Europe
  'Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Lidl', 'Aldi UK', 'Waitrose',
  // Online
  'Amazon Fresh', 'Instacart',
  // Other
  'Local / Independent Market', 'Other',
] as const;
```

to:

```ts
export const GROCERY_STORES = [
  // North America
  'Walmart', 'Target', 'Costco', 'Kroger', 'Whole Foods', "Trader Joe's",
  'Aldi', 'Safeway', 'Publix', 'H-E-B', 'Wegmans', 'Meijer', 'Food Lion',
  // Canada
  'Loblaws', "No Frills", 'FreshCo', 'Sobeys', 'Metro', 'Real Canadian Superstore',
  'Save-On-Foods', 'T&T Supermarket', 'Indian Grocery Store',
  // UK / Europe
  'Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Lidl', 'Aldi UK', 'Waitrose',
  // Online
  'Amazon Fresh', 'Instacart',
  // Other
  'Local / Independent Market', 'Other',
] as const;

export const MANUAL_INGREDIENTS_OPTION = 'Manual — I already have ingredients';
```

- [ ] **Step 2: Add cuisine/appliance constants and the `MealPlanningAnswers` type**

Add after the existing `GroceryAnswers` type:

```ts
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
  householdSize: number;
  cookMode: 'weekly_batch' | 'fresh_daily';
  cuisinePreferences: string[]; // ignored when surpriseMe is true
  surpriseMe: boolean;
  kitchenAppliances: string[]; // [] means "not cooking at home"
};
```

- [ ] **Step 3: Add `mealPlanning?` to `LifestyleAnswers`**

Change:

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
};
```

to:

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

- [ ] **Step 4: Add the wizard's shared meal/grid/answers types**

Add at the end of the file:

```ts
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealCandidate = {
  id: string;
  mealType: MealType;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  prepMinutes: number;
};

export type MealGridCell = {
  dayOfWeek: number; // 0=Sun..6=Sat
  mealType: MealType;
  meal: MealCandidate | null;
};

export type MealPlannerWizardAnswers = {
  store: string; // one of GROCERY_STORES, or MANUAL_INGREDIENTS_OPTION
  onHandIngredients: string[]; // only meaningful when store === MANUAL_INGREDIENTS_OPTION
  householdSize: number;
  cookMode: 'weekly_batch' | 'fresh_daily';
  mealsPerDay: number;
  cuisinePreferences: string[];
  surpriseMe: boolean;
  appliances: string[];
};
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/types.ts
git commit -m "feat: add meal-planner types and extend GROCERY_STORES"
```

---

### Task 3: AI candidates route

**Files:**
- Create: `app/api/ai/meal-plan/candidates/route.ts`

**Interfaces:**
- Consumes: `getModel` from `@/lib/ai/modelConfig`, `formatAiError` from `@/lib/ai/errors`, `MealCandidate`/`MealPlannerWizardAnswers`/`MANUAL_INGREDIENTS_OPTION` from `@/lib/ai/types` (Task 2).
- Produces: `POST /api/ai/meal-plan/candidates` — request body `Omit<MealPlannerWizardAnswers, never>` (all fields required), response `{ candidates: MealCandidate[] }` (10–12 items) or `{ error: string }`. Consumed by Task 8 (`MealSelectionStep`).

- [ ] **Step 1: Write the route**

```ts
// app/api/ai/meal-plan/candidates/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { MANUAL_INGREDIENTS_OPTION, type MealCandidate, type MealPlannerWizardAnswers, type LifestyleAnswers } from '@/lib/ai/types';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const MEAL_TYPES_BY_COUNT: Record<number, string[]> = {
  1: ['lunch'],
  2: ['lunch', 'dinner'],
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'dinner', 'snack'],
};

function buildCandidatesPrompt(answers: MealPlannerWizardAnswers, lifestyle: LifestyleAnswers): string {
  const mealTypes = MEAL_TYPES_BY_COUNT[Math.min(4, Math.max(1, answers.mealsPerDay))] ?? MEAL_TYPES_BY_COUNT[3];
  const dietStyle = lifestyle.nutrition?.dietStyle ?? 'none';
  const restrictions = lifestyle.nutrition?.restrictions ?? 'None';

  const sourceLine = answers.store === MANUAL_INGREDIENTS_OPTION
    ? `The user already has these ingredients on hand and wants to cook mostly from them: ${answers.onHandIngredients.join(', ') || 'nothing specified'}. Minimize new purchases.`
    : `Prioritize ingredients commonly found at ${answers.store}.`;

  const cuisineLine = answers.surpriseMe
    ? 'No cuisine preference — surprise the user with a flexible variety of styles.'
    : `Cuisine styles the user likes: ${answers.cuisinePreferences.join(', ') || 'any'}.`;

  const applianceLine = answers.appliances.length > 0
    ? `Available kitchen appliances: ${answers.appliances.join(', ')}. Only suggest recipes usable with this equipment.`
    : 'The user is not cooking at home — only suggest no-cook / ready-to-eat options.';

  const cookModeLine = answers.cookMode === 'weekly_batch'
    ? `The user batch-cooks once and eats the same meals across the week for ${answers.householdSize} people — favor recipes that reheat/store well.`
    : `The user cooks fresh at each meal for ${answers.householdSize} people — variety across the week is welcome.`;

  return `You are a certified nutritionist and meal planning expert.

Diet style: ${dietStyle === 'none' ? 'No dietary restrictions' : dietStyle}
Dietary restrictions / allergies: ${restrictions}
${sourceLine}
${cuisineLine}
${applianceLine}
${cookModeLine}

Generate 10 to 12 candidate meal ideas covering these meal types: ${mealTypes.join(', ')}. Each candidate is a standalone recipe idea, not yet assigned to a specific day.

Respond ONLY with a valid JSON object (no markdown) in this exact shape:
{
  "candidates": [
    { "mealType": "breakfast", "name": "...", "description": "brief 1-line description", "calories": 400, "protein": 25, "carbs": 45, "fat": 12, "prepMinutes": 10 }
    ... (10 to 12 total, mealType must be one of: ${mealTypes.join(', ')})
  ]
}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('lifestyle')
      .eq('userId', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const answers = (await request.json()) as MealPlannerWizardAnswers;
    const lifestyle = (profile.lifestyle ?? {}) as LifestyleAnswers;

    MODEL = await getModel(supabase, 'text');

    const prompt = buildCandidatesPrompt(answers, lifestyle);

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { candidates?: Omit<MealCandidate, 'id'>[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.candidates || parsed.candidates.length === 0) {
      return NextResponse.json({ error: 'AI response missing candidates' }, { status: 502 });
    }

    const candidates: MealCandidate[] = parsed.candidates.map((c, i) => ({ ...c, id: String(i) }));

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('meal-plan candidates error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: succeeds (route isn't called by any UI yet).

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/meal-plan/candidates/route.ts
git commit -m "feat: add meal-plan candidates AI route"
```

---

### Task 4: AI finalize route

**Files:**
- Create: `app/api/ai/meal-plan/finalize/route.ts`

**Interfaces:**
- Consumes: `MealGridCell`/`MealPlannerWizardAnswers`/`MANUAL_INGREDIENTS_OPTION`/`LifestyleAnswers` from `@/lib/ai/types` (Task 2); writes `meal_plan_entries` (existing table, same `onConflict: 'profileId,dayOfWeek,mealType'` contract as `app/api/ai/meal-plan/route.ts`), `grocery_lists` (Task 1, `onConflict: 'profileId'`), and `profiles.lastMealPlanGeneratedAt`/`profiles.lifestyle.mealPlanning` (Task 1/2).
- Produces: `POST /api/ai/meal-plan/finalize` — request body `{ grid: MealGridCell[]; answers: MealPlannerWizardAnswers }`, response `{ groceryList: Record<string, string[]>; estimatedBudget: string }` or `{ error: string }`. Consumed by Task 9 (`WeekGridStep`).

- [ ] **Step 1: Write the route**

```ts
// app/api/ai/meal-plan/finalize/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { MANUAL_INGREDIENTS_OPTION, type MealGridCell, type MealPlannerWizardAnswers, type LifestyleAnswers } from '@/lib/ai/types';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

function buildGroceryListPrompt(grid: MealGridCell[], answers: MealPlannerWizardAnswers): string {
  const mealLines = grid
    .filter((cell) => cell.meal)
    .map((cell) => `- ${cell.meal!.name}: ${cell.meal!.description}`)
    .filter((line, i, arr) => arr.indexOf(line) === i) // dedupe repeated batch-cook meals
    .join('\n');

  const sourceLine = answers.store === MANUAL_INGREDIENTS_OPTION
    ? `The user already has these on hand: ${answers.onHandIngredients.join(', ') || 'nothing specified'}. Exclude them from the list unless more is needed.`
    : `Estimate typical prices for ${answers.store}.`;

  return `You are a grocery planning assistant. Given this finalized weekly meal set for a household of ${answers.householdSize} people:

${mealLines}

${sourceLine}

Generate a consolidated grocery list grouped by category (Produce, Protein, Dairy/Alternatives, Grains/Carbs, Pantry/Spices, Frozen), with quantities scaled for ${answers.householdSize} people across the week, and an estimated total weekly budget range.

Respond ONLY with a valid JSON object (no markdown) in this exact shape:
{
  "groceryList": {
    "Produce": ["item1", "item2"],
    "Protein": ["item1"],
    "Dairy / Alternatives": ["item1"],
    "Grains & Carbs": ["item1"],
    "Pantry & Spices": ["item1"],
    "Frozen": ["item1"]
  },
  "estimatedBudget": "$XX–$XX"
}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, lifestyle')
      .eq('userId', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = (await request.json()) as { grid: MealGridCell[]; answers: MealPlannerWizardAnswers };
    const { grid, answers } = body;

    if (!grid || grid.length === 0) {
      return NextResponse.json({ error: 'No meals to finalize' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [{ role: 'user', content: buildGroceryListPrompt(grid, answers) }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { groceryList?: Record<string, string[]>; estimatedBudget?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.groceryList) {
      return NextResponse.json({ error: 'AI response missing grocery list' }, { status: 502 });
    }

    const rows = grid
      .filter((cell) => cell.meal)
      .map((cell) => ({
        profileId: profile.id,
        dayOfWeek: cell.dayOfWeek,
        mealType: cell.mealType,
        name: cell.meal!.name,
        description: cell.meal!.description,
        calories: cell.meal!.calories ?? null,
        protein: cell.meal!.protein ?? null,
        carbs: cell.meal!.carbs ?? null,
        fat: cell.meal!.fat ?? null,
        prepMinutes: cell.meal!.prepMinutes ?? null,
      }));

    const { error: mealPlanError } = await supabase
      .from('meal_plan_entries')
      .upsert(rows, { onConflict: 'profileId,dayOfWeek,mealType' });
    if (mealPlanError) console.error('finalize: meal_plan_entries upsert failed:', mealPlanError);

    const { error: groceryError } = await supabase
      .from('grocery_lists')
      .upsert(
        { profileId: profile.id, items: parsed.groceryList, estimatedBudget: parsed.estimatedBudget ?? null },
        { onConflict: 'profileId' }
      );
    if (groceryError) console.error('finalize: grocery_lists upsert failed:', groceryError);

    const existingLifestyle = (profile.lifestyle ?? {}) as LifestyleAnswers;
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        lastMealPlanGeneratedAt: new Date().toISOString(),
        lifestyle: {
          ...existingLifestyle,
          mealPlanning: {
            householdSize: answers.householdSize,
            cookMode: answers.cookMode,
            cuisinePreferences: answers.cuisinePreferences,
            surpriseMe: answers.surpriseMe,
            kitchenAppliances: answers.appliances,
          },
        },
      })
      .eq('id', profile.id);
    if (profileError) console.error('finalize: profile update failed:', profileError);

    return NextResponse.json({ groceryList: parsed.groceryList, estimatedBudget: parsed.estimatedBudget ?? '' });
  } catch (error) {
    console.error('meal-plan finalize error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/meal-plan/finalize/route.ts
git commit -m "feat: add meal-plan finalize AI route"
```

---

### Task 5: Wizard shell + Store step

**Files:**
- Create: `app/(burnlog)/meal-planner/page.tsx`
- Create: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`
- Create: `app/(burnlog)/meal-planner/_components/StoreStep.tsx`

**Interfaces:**
- Consumes: `GROCERY_STORES`, `MANUAL_INGREDIENTS_OPTION`, `MealPlannerWizardAnswers` from `@/lib/ai/types` (Task 2).
- Produces: `MealPlannerFlow` — the orchestrator all later steps (Tasks 6–11) plug into via `answers: Partial<MealPlannerWizardAnswers>` state and a `WizardStep` union that Tasks 6–11 extend by editing this file. `StoreStep({ initialAnswers, onContinue }: { initialAnswers?: Partial<MealPlannerWizardAnswers>; onContinue: (partial: Pick<MealPlannerWizardAnswers, 'store' | 'onHandIngredients'>) => void })`.

- [ ] **Step 1: Write `StoreStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/StoreStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GROCERY_STORES, MANUAL_INGREDIENTS_OPTION, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type StoreStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'store' | 'onHandIngredients'>) => void;
};

export function StoreStep({ initialAnswers, onContinue }: StoreStepProps) {
  const [store, setStore] = useState(initialAnswers?.store ?? '');
  const [pantryText, setPantryText] = useState((initialAnswers?.onHandIngredients ?? []).join('\n'));

  const isManual = store === MANUAL_INGREDIENTS_OPTION;

  const handleContinue = () => {
    onContinue({
      store: store || GROCERY_STORES[0],
      onHandIngredients: isManual
        ? pantryText.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
    });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🛒 Where are you shopping?</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll build your meals and grocery list around this.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Grocery store</Label>
          <Select value={store} onValueChange={setStore}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a store…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {GROCERY_STORES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <SelectItem value={MANUAL_INGREDIENTS_OPTION}>{MANUAL_INGREDIENTS_OPTION}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isManual && (
          <div className="space-y-2">
            <Label>What ingredients do you already have?</Label>
            <Textarea
              value={pantryText}
              onChange={(e) => setPantryText(e.target.value)}
              placeholder={'One item per line, e.g.\nRice\nChicken breast\nOnions'}
              rows={5}
            />
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleContinue} disabled={!store}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `MealPlannerFlow.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { StoreStep } from './StoreStep';
import type { LifestyleAnswers, MealPlannerWizardAnswers } from '@/lib/ai/types';

export type WizardStep = 'loading' | 'store' | 'household' | 'preferences' | 'appliances' | 'generating-candidates' | 'selecting' | 'grid' | 'finalizing' | 'grocery' | 'shopping' | 'done';

export function MealPlannerFlow() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [step, setStep] = useState<WizardStep>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [answers, setAnswers] = useState<Partial<MealPlannerWizardAnswers>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
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
      const lifestyle = (profile.lifestyle ?? null) as LifestyleAnswers | null;
      setInitialLifestyle(lifestyle);
      setAnswers((prev) => ({
        ...prev,
        mealsPerDay: lifestyle?.nutrition?.mealsPerDay ?? 3,
        householdSize: lifestyle?.mealPlanning?.householdSize ?? 1,
        cookMode: lifestyle?.mealPlanning?.cookMode ?? 'fresh_daily',
        cuisinePreferences: lifestyle?.mealPlanning?.cuisinePreferences ?? [],
        surpriseMe: lifestyle?.mealPlanning?.surpriseMe ?? false,
        appliances: lifestyle?.mealPlanning?.kitchenAppliances ?? [],
      }));
      setStep('store');
    })();
  }, [supabase, router]);

  if (step === 'loading' || !profileId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 z-10">
          {error}
        </div>
      )}

      {step === 'store' && (
        <StoreStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('household');
          }}
        />
      )}

      {step === 'household' && (
        <div className="text-sm text-muted-foreground">Household step coming in Task 6…</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// app/(burnlog)/meal-planner/page.tsx
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { MealPlannerFlow } from './_components/MealPlannerFlow';

export default function MealPlannerPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <MealPlannerFlow />
    </Suspense>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: succeeds; `/meal-planner` compiles and shows the Store step (manually verify in-browser: pick "Costco", click Continue → placeholder "Household step" text appears; pick the manual option → textarea appears).

- [ ] **Step 5: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add meal planner wizard shell and store step"
```

---

### Task 6: Household + preferences steps

**Files:**
- Create: `app/(burnlog)/meal-planner/_components/HouseholdStep.tsx`
- Create: `app/(burnlog)/meal-planner/_components/PreferencesStep.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes: `CUISINE_STYLES` from `@/lib/ai/types` (Task 2).
- Produces: `HouseholdStep({ initialAnswers, onContinue }: { initialAnswers?: Partial<MealPlannerWizardAnswers>; onContinue: (partial: Pick<MealPlannerWizardAnswers, 'householdSize' | 'cookMode'>) => void })`; `PreferencesStep({ initialAnswers, onContinue }: { initialAnswers?: Partial<MealPlannerWizardAnswers>; onContinue: (partial: Pick<MealPlannerWizardAnswers, 'mealsPerDay' | 'cuisinePreferences' | 'surpriseMe'>) => void })`.

- [ ] **Step 1: Write `HouseholdStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/HouseholdStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { MealPlannerWizardAnswers } from '@/lib/ai/types';

type HouseholdStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'householdSize' | 'cookMode'>) => void;
};

export function HouseholdStep({ initialAnswers, onContinue }: HouseholdStepProps) {
  const [householdSize, setHouseholdSize] = useState(initialAnswers?.householdSize ?? 1);
  const [cookMode, setCookMode] = useState<MealPlannerWizardAnswers['cookMode']>(
    initialAnswers?.cookMode ?? 'fresh_daily'
  );

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>👥 Who are you cooking for?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Number of people</Label>
          <Input
            type="number"
            min={1}
            value={householdSize}
            onChange={(e) => setHouseholdSize(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <div className="space-y-2">
          <Label>How do you want to cook this week?</Label>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setCookMode('weekly_batch')}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                cookMode === 'weekly_batch' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              🍲 Batch cook once, eat all week
            </button>
            <button
              type="button"
              onClick={() => setCookMode('fresh_daily')}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                cookMode === 'fresh_daily' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              🔥 Cook fresh at each meal
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue({ householdSize, cookMode })}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `PreferencesStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/PreferencesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CUISINE_STYLES, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type PreferencesStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'mealsPerDay' | 'cuisinePreferences' | 'surpriseMe'>) => void;
};

export function PreferencesStep({ initialAnswers, onContinue }: PreferencesStepProps) {
  const [mealsPerDay, setMealsPerDay] = useState(initialAnswers?.mealsPerDay ?? 3);
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>(initialAnswers?.cuisinePreferences ?? []);
  const [surpriseMe, setSurpriseMe] = useState(initialAnswers?.surpriseMe ?? false);

  const toggle = (value: string) => {
    setCuisinePreferences((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🍽️ What do you feel like eating?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Meals per day</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={mealsPerDay}
            onChange={(e) => setMealsPerDay(Math.min(4, Math.max(1, Number(e.target.value) || 3)))}
          />
        </div>

        <label className="flex items-center space-x-3 rounded-xl border p-3">
          <Checkbox checked={surpriseMe} onCheckedChange={(v) => setSurpriseMe(!!v)} />
          <span className="text-sm">✨ Surprise me — no cuisine preference, just pick creatively</span>
        </label>

        {!surpriseMe && (
          <div className="space-y-2">
            <Label>Cuisine styles you like</Label>
            <div className="grid grid-cols-2 gap-2">
              {CUISINE_STYLES.map((c) => (
                <label key={c} className="flex items-center space-x-2">
                  <Checkbox checked={cuisinePreferences.includes(c)} onCheckedChange={() => toggle(c)} />
                  <span className="text-sm">{c}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue({ mealsPerDay, cuisinePreferences: surpriseMe ? [] : cuisinePreferences, surpriseMe })}>
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire both steps into `MealPlannerFlow.tsx`**

Add imports:

```tsx
import { HouseholdStep } from './HouseholdStep';
import { PreferencesStep } from './PreferencesStep';
```

Replace:

```tsx
      {step === 'household' && (
        <div className="text-sm text-muted-foreground">Household step coming in Task 6…</div>
      )}
```

with:

```tsx
      {step === 'household' && (
        <HouseholdStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('preferences');
          }}
        />
      )}

      {step === 'preferences' && (
        <PreferencesStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('appliances');
          }}
        />
      )}

      {step === 'appliances' && (
        <div className="text-sm text-muted-foreground">Appliances step coming in Task 7…</div>
      )}
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: succeeds; walking Store → Household → Preferences in-browser reaches the "Appliances step" placeholder.

- [ ] **Step 5: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add household and preferences wizard steps"
```

---

### Task 7: Appliances step

**Files:**
- Create: `app/(burnlog)/meal-planner/_components/AppliancesStep.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes: `KITCHEN_APPLIANCES` from `@/lib/ai/types` (Task 2).
- Produces: `AppliancesStep({ initialAnswers, onContinue }: { initialAnswers?: Partial<MealPlannerWizardAnswers>; onContinue: (partial: Pick<MealPlannerWizardAnswers, 'appliances'>) => void })`.

- [ ] **Step 1: Write `AppliancesStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/AppliancesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { KITCHEN_APPLIANCES, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type AppliancesStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'appliances'>) => void;
};

export function AppliancesStep({ initialAnswers, onContinue }: AppliancesStepProps) {
  const [cookingAtHome, setCookingAtHome] = useState((initialAnswers?.appliances?.length ?? 0) > 0 || initialAnswers?.appliances === undefined);
  const [appliances, setAppliances] = useState<string[]>(initialAnswers?.appliances ?? []);

  const toggle = (value: string) => {
    setAppliances((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🍳 Cooking at home?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setCookingAtHome(true)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
              cookingAtHome ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            Yes, I&apos;m cooking at home
          </button>
          <button
            type="button"
            onClick={() => setCookingAtHome(false)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
              !cookingAtHome ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            No, keep it no-cook / ready-to-eat
          </button>
        </div>

        {cookingAtHome && (
          <div className="space-y-2">
            <Label>What do you have available?</Label>
            <div className="grid grid-cols-2 gap-2">
              {KITCHEN_APPLIANCES.map((a) => (
                <label key={a} className="flex items-center space-x-2">
                  <Checkbox checked={appliances.includes(a)} onCheckedChange={() => toggle(a)} />
                  <span className="text-sm">{a}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue({ appliances: cookingAtHome ? appliances : [] })}>
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `MealPlannerFlow.tsx`**

Add import:

```tsx
import { AppliancesStep } from './AppliancesStep';
```

Replace:

```tsx
      {step === 'appliances' && (
        <div className="text-sm text-muted-foreground">Appliances step coming in Task 7…</div>
      )}
```

with:

```tsx
      {step === 'appliances' && (
        <AppliancesStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('generating-candidates');
          }}
        />
      )}

      {step === 'generating-candidates' && (
        <div className="text-sm text-muted-foreground">Candidate generation coming in Task 8…</div>
      )}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds; walking through to Appliances, toggling "No", clicking Continue reaches the "Candidate generation" placeholder with no appliance multiselect shown.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add appliances wizard step"
```

---

### Task 8: Meal candidate generation + selection step

**Files:**
- Create: `app/(burnlog)/meal-planner/_components/MealSelectionStep.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/meal-plan/candidates` (Task 3); `MealCandidate` from `@/lib/ai/types` (Task 2); `AiLoading` from `@/components/kokonutui/ai-loading` (existing).
- Produces: `MealSelectionStep({ candidates, cookMode, mealsPerDay, onContinue }: { candidates: MealCandidate[]; cookMode: MealPlannerWizardAnswers['cookMode']; mealsPerDay: number; onContinue: (selected: MealCandidate[]) => void })`. `MealPlannerFlow` gains `candidates: MealCandidate[]` state, consumed by Task 9.

- [ ] **Step 1: Write `MealSelectionStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/MealSelectionStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MealCandidate, MealPlannerWizardAnswers } from '@/lib/ai/types';

const MEAL_LABEL: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  lunch: '☀️ Lunch',
  dinner: '🌙 Dinner',
  snack: '🍎 Snack',
};

type MealSelectionStepProps = {
  candidates: MealCandidate[];
  cookMode: MealPlannerWizardAnswers['cookMode'];
  mealsPerDay: number;
  onContinue: (selected: MealCandidate[]) => void;
};

export function MealSelectionStep({ candidates, cookMode, mealsPerDay, onContinue }: MealSelectionStepProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const suggestedCount = cookMode === 'weekly_batch' ? Math.min(4, candidates.length) : Math.min(7, candidates.length);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const selected = candidates.filter((c) => selectedIds.includes(c.id));

  return (
    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>✨ Pick your meals</CardTitle>
        <p className="text-sm text-muted-foreground">
          Selected: {selectedIds.length} · Suggested for your week: ~{suggestedCount} ({mealsPerDay} meals/day)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidates.map((c) => {
          const isSelected = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={`w-full text-left rounded-xl border p-3 transition-colors ${
                isSelected ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {MEAL_LABEL[c.mealType] ?? c.mealType}
                </span>
                <span className="text-[10px] text-muted-foreground">⏱ {c.prepMinutes} min</span>
              </div>
              <p className="font-medium text-sm mt-1">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.description}</p>
              <div className="flex gap-3 text-[10px] mt-1">
                <span className="text-orange-500 font-medium">{c.calories} kcal</span>
                <span className="text-blue-500">P: {c.protein}g</span>
                <span className="text-green-500">C: {c.carbs}g</span>
                <span className="text-red-500">F: {c.fat}g</span>
              </div>
            </button>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue(selected)} disabled={selected.length === 0}>
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire candidate fetching + the step into `MealPlannerFlow.tsx`**

Add imports:

```tsx
import { MealSelectionStep } from './MealSelectionStep';
import { AiLoading } from '@/components/kokonutui/ai-loading';
import type { MealCandidate } from '@/lib/ai/types';
```

Add state (near the other `useState` declarations):

```tsx
  const [candidates, setCandidates] = useState<MealCandidate[]>([]);
```

Add a fetch effect, right after the existing profile-loading `useEffect`:

```tsx
  useEffect(() => {
    if (step !== 'generating-candidates') return;
    (async () => {
      setError(null);
      try {
        const res = await fetch('/api/ai/meal-plan/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error ?? 'Failed to generate meal ideas. Please try again.');
          setStep('appliances');
          return;
        }
        setCandidates(data.candidates as MealCandidate[]);
        setStep('selecting');
      } catch {
        setError('Network error. Please try again.');
        setStep('appliances');
      }
    })();
  }, [step, answers]);
```

Replace:

```tsx
      {step === 'generating-candidates' && (
        <div className="text-sm text-muted-foreground">Candidate generation coming in Task 8…</div>
      )}
```

with:

```tsx
      {step === 'generating-candidates' && (
        <AiLoading tasks={["Reviewing your preferences", "Thinking up meal ideas", "Balancing macros", "Almost ready"]} />
      )}

      {step === 'selecting' && (
        <MealSelectionStep
          candidates={candidates}
          cookMode={answers.cookMode ?? 'fresh_daily'}
          mealsPerDay={answers.mealsPerDay ?? 3}
          onContinue={(selected) => {
            setStep('grid');
          }}
        />
      )}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds; walking through the wizard in-browser reaches the AI loading screen, then a scrollable list of 10-12 selectable meal cards.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add meal candidate generation and selection step"
```

---

### Task 9: Week grid step with tap-to-swap + finalize wiring

**Files:**
- Create: `app/(burnlog)/meal-planner/_components/WeekGridStep.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/meal-plan/finalize` (Task 4); `MealGridCell`/`MealCandidate` from `@/lib/ai/types` (Task 2).
- Produces: `WeekGridStep({ selected, mealsPerDay, onConfirm }: { selected: MealCandidate[]; mealsPerDay: number; onConfirm: (grid: MealGridCell[]) => void })`. `MealPlannerFlow` gains `grid: MealGridCell[]`, `groceryList: Record<string,string[]> | null`, `estimatedBudget: string` state, consumed by Task 10.

- [ ] **Step 1: Write `WeekGridStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/WeekGridStep.tsx
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MealCandidate, MealGridCell, MealType } from '@/lib/ai/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MEAL_TYPES_BY_COUNT: Record<number, MealType[]> = {
  1: ['lunch'],
  2: ['lunch', 'dinner'],
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'dinner', 'snack'],
};

function buildInitialGrid(selected: MealCandidate[], mealsPerDay: number): MealGridCell[] {
  const mealTypes = MEAL_TYPES_BY_COUNT[Math.min(4, Math.max(1, mealsPerDay))] ?? MEAL_TYPES_BY_COUNT[3];
  const cells: MealGridCell[] = [];
  let i = 0;
  for (let day = 0; day < 7; day++) {
    for (const mealType of mealTypes) {
      cells.push({ dayOfWeek: day, mealType, meal: selected.length ? selected[i % selected.length] : null });
      i++;
    }
  }
  return cells;
}

function cellKey(dayOfWeek: number, mealType: string): string {
  return `${dayOfWeek}-${mealType}`;
}

type WeekGridStepProps = {
  selected: MealCandidate[];
  mealsPerDay: number;
  onConfirm: (grid: MealGridCell[]) => void;
};

export function WeekGridStep({ selected, mealsPerDay, onConfirm }: WeekGridStepProps) {
  const initialGrid = useMemo(() => buildInitialGrid(selected, mealsPerDay), [selected, mealsPerDay]);
  const [grid, setGrid] = useState<MealGridCell[]>(initialGrid);
  const [swapSource, setSwapSource] = useState<string | null>(null);

  const mealTypes = MEAL_TYPES_BY_COUNT[Math.min(4, Math.max(1, mealsPerDay))] ?? MEAL_TYPES_BY_COUNT[3];

  const handleTap = (dayOfWeek: number, mealType: string) => {
    const key = cellKey(dayOfWeek, mealType);
    if (swapSource === null) {
      setSwapSource(key);
      return;
    }
    if (swapSource === key) {
      setSwapSource(null);
      return;
    }
    setGrid((prev) => {
      const next = [...prev];
      const aIdx = next.findIndex((c) => cellKey(c.dayOfWeek, c.mealType) === swapSource);
      const bIdx = next.findIndex((c) => cellKey(c.dayOfWeek, c.mealType) === key);
      const aMeal = next[aIdx].meal;
      next[aIdx] = { ...next[aIdx], meal: next[bIdx].meal };
      next[bIdx] = { ...next[bIdx], meal: aMeal };
      return next;
    });
    setSwapSource(null);
  };

  return (
    <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>📅 Arrange your week</CardTitle>
        <p className="text-sm text-muted-foreground">Tap a meal, then tap another to swap them.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 text-xs">
          {DAY_LABELS.map((label) => (
            <div key={label} className="text-center font-semibold text-muted-foreground">{label}</div>
          ))}
          {mealTypes.map((mealType) => (
            <div key={mealType} className="contents">
              {DAY_LABELS.map((_, dayOfWeek) => {
                const cell = grid.find((c) => c.dayOfWeek === dayOfWeek && c.mealType === mealType);
                const key = cellKey(dayOfWeek, mealType);
                const isSelected = swapSource === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTap(dayOfWeek, mealType)}
                    className={`rounded-lg border p-2 h-20 text-left overflow-hidden transition-colors ${
                      isSelected ? 'bg-primary/20 border-primary' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="text-[9px] uppercase text-muted-foreground">{mealType}</div>
                    <div className="text-[11px] font-medium line-clamp-3">{cell?.meal?.name ?? '—'}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={() => onConfirm(grid)}>Confirm week →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `MealPlannerFlow.tsx`**

Add imports:

```tsx
import { WeekGridStep } from './WeekGridStep';
import type { MealGridCell } from '@/lib/ai/types';
```

Add state:

```tsx
  const [selectedMeals, setSelectedMeals] = useState<MealCandidate[]>([]);
  const [grid, setGrid] = useState<MealGridCell[]>([]);
  const [groceryList, setGroceryList] = useState<Record<string, string[]> | null>(null);
  const [estimatedBudget, setEstimatedBudget] = useState('');
```

Change the `MealSelectionStep`'s `onContinue` from:

```tsx
          onContinue={(selected) => {
            setStep('grid');
          }}
```

to:

```tsx
          onContinue={(selected) => {
            setSelectedMeals(selected);
            setStep('grid');
          }}
```

Add a finalize effect, after the candidates-fetch effect:

```tsx
  useEffect(() => {
    if (step !== 'finalizing') return;
    (async () => {
      setError(null);
      try {
        const res = await fetch('/api/ai/meal-plan/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid, answers }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error ?? 'Failed to finalize your plan. Please try again.');
          setStep('grid');
          return;
        }
        setGroceryList(data.groceryList);
        setEstimatedBudget(data.estimatedBudget ?? '');
        setStep('grocery');
      } catch {
        setError('Network error. Please try again.');
        setStep('grid');
      }
    })();
  }, [step, grid, answers]);
```

Replace the `selecting` block's closing (add the `grid`/`finalizing` render blocks right after it):

```tsx
      {step === 'grid' && (
        <WeekGridStep
          selected={selectedMeals}
          mealsPerDay={answers.mealsPerDay ?? 3}
          onConfirm={(confirmedGrid) => {
            setGrid(confirmedGrid);
            setStep('finalizing');
          }}
        />
      )}

      {step === 'finalizing' && (
        <AiLoading tasks={["Building your grocery list", "Estimating your budget", "Saving your plan"]} />
      )}

      {step === 'grocery' && (
        <div className="text-sm text-muted-foreground">Grocery list step coming in Task 10…</div>
      )}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds; walking through the full wizard reaches the week grid, tapping two filled cells swaps their names, "Confirm week" shows the finalizing loader then the grocery placeholder.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add week grid step with tap-to-swap and finalize wiring"
```

---

### Task 10: Grocery list step + read-only grocery list page

**Files:**
- Create: `app/(burnlog)/meal-planner/_components/GroceryListStep.tsx`
- Create: `app/(burnlog)/meal-planner/grocery-list/page.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes: `grocery_lists` table (Task 1) for the read-only page.
- Produces: `GroceryListStep({ groceryList, estimatedBudget, onContinue }: { groceryList: Record<string, string[]>; estimatedBudget: string; onContinue: () => void })`. Route `/meal-planner/grocery-list` (read-only, used by the shopping-day push notification's click-through, Task 12/11).

- [ ] **Step 1: Write `GroceryListStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/GroceryListStep.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type GroceryListStepProps = {
  groceryList: Record<string, string[]>;
  estimatedBudget: string;
  onContinue: () => void;
};

export function GroceryListStep({ groceryList, estimatedBudget, onContinue }: GroceryListStepProps) {
  return (
    <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>🧾 Your grocery list</CardTitle>
        {estimatedBudget && <p className="text-sm text-muted-foreground">Estimated budget: {estimatedBudget}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groceryList).map(([category, items]) => (
          items.length > 0 && (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{category}</p>
              <ul className="text-sm space-y-1">
                {items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )
        ))}

        <div className="flex justify-end pt-2">
          <Button onClick={onContinue}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write the read-only grocery list page**

```tsx
// app/(burnlog)/meal-planner/grocery-list/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type GroceryListRow = {
  items: Record<string, string[]>;
  estimatedBudget: string | null;
};

export default function GroceryListPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [row, setRow] = useState<GroceryListRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('grocery_lists')
        .select('items, estimatedBudget')
        .eq('profileId', profile.id)
        .maybeSingle();
      setRow(data as GroceryListRow | null);
      setLoading(false);
    })();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">No grocery list yet — run the Meal Planner first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>🧾 Your grocery list</CardTitle>
          {row.estimatedBudget && <p className="text-sm text-muted-foreground">Estimated budget: {row.estimatedBudget}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(row.items).map(([category, items]) => (
            items.length > 0 && (
              <div key={category}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{category}</p>
                <ul className="text-sm space-y-1">
                  {items.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            )
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Wire `GroceryListStep` into `MealPlannerFlow.tsx`**

Add import:

```tsx
import { GroceryListStep } from './GroceryListStep';
```

Replace:

```tsx
      {step === 'grocery' && (
        <div className="text-sm text-muted-foreground">Grocery list step coming in Task 10…</div>
      )}
```

with:

```tsx
      {step === 'grocery' && groceryList && (
        <GroceryListStep
          groceryList={groceryList}
          estimatedBudget={estimatedBudget}
          onContinue={() => setStep('shopping')}
        />
      )}

      {step === 'shopping' && (
        <div className="text-sm text-muted-foreground">Shopping day step coming in Task 11…</div>
      )}
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: succeeds; completing the wizard through "Confirm week" shows the categorized grocery list with budget, and `/meal-planner/grocery-list` renders the same persisted list directly.

- [ ] **Step 5: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add grocery list step and read-only grocery list page"
```

---

### Task 11: Shopping day step (one-off reminder)

**Files:**
- Create: `app/(burnlog)/meal-planner/_components/ShoppingDayStep.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`

**Interfaces:**
- Consumes/Produces: writes one row to `scheduled_reminders` (Task 1) with `remindAt` set, `dayOfWeek`/`timeOfDay`/`timezone` left null (the one-off shape) — this is what the cron in Task 12 reads.

- [ ] **Step 1: Write `ShoppingDayStep.tsx`**

```tsx
// app/(burnlog)/meal-planner/_components/ShoppingDayStep.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type ShoppingDayStepProps = {
  profileId: string;
  onDone: () => void;
};

export function ShoppingDayStep({ profileId, onDone }: ShoppingDayStepProps) {
  const supabase = createClientComponentClient();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!date) {
      setError('Pick a date first.');
      return;
    }
    setSaving(true);
    setError(null);
    const remindAt = new Date(`${date}T${time}`);
    const { error: insertError } = await supabase.from('scheduled_reminders').insert({
      profileId,
      title: 'Grocery run 🛒',
      message: 'Your grocery list for this week is ready.',
      url: '/meal-planner/grocery-list',
      remindAt: remindAt.toISOString(),
    });
    setSaving(false);
    if (insertError) {
      setError('Failed to schedule your reminder. Please try again.');
      return;
    }
    onDone();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🗓️ When are you shopping?</CardTitle>
        <p className="text-sm text-muted-foreground">We&apos;ll remind you with your list.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Done →'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `MealPlannerFlow.tsx`**

Add imports (`Card`/`CardContent` are needed here for the new "done" screen — `MealPlannerFlow.tsx` doesn't import them yet):

```tsx
import { ShoppingDayStep } from './ShoppingDayStep';
import { Card, CardContent } from '@/components/ui/card';
```

Replace:

```tsx
      {step === 'shopping' && (
        <div className="text-sm text-muted-foreground">Shopping day step coming in Task 11…</div>
      )}
```

with:

```tsx
      {step === 'shopping' && (
        <ShoppingDayStep profileId={profileId} onDone={() => setStep('done')} />
      )}

      {step === 'done' && (
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 space-y-4">
            <p className="text-lg font-medium">🎉 Your week is planned!</p>
            <Button onClick={() => router.push('/session')}>Go to Plan</Button>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds. Full end-to-end manual walkthrough (Chrome DevTools MCP): complete the entire wizard from Store through Shopping Day; confirm a "done" screen appears and clicking "Go to Plan" navigates to `/session`. Query `scheduled_reminders` via `mcp__supabase__execute_sql` to confirm the one-off row was inserted with the chosen `remindAt`.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/meal-planner"
git commit -m "feat: add shopping day step, complete wizard end-to-end"
```

---

## Phase 2: Scheduled reminder cron

### Task 12: `scheduled-reminders` cron endpoint

**Files:**
- Create: `app/api/cron/scheduled-reminders/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `createServiceRoleClient` from `@/lib/supabase/serviceRole`, `sendPushToUser` from `@/lib/pushNotification/server` (both existing, unchanged); `scheduled_reminders` table (Task 1).
- Produces: `GET /api/cron/scheduled-reminders` (Bearer `CRON_SECRET` auth, same pattern as `evening-checkin`), returns `{ sent, skipped, errors }`. Consumed by nothing in-app (external cron trigger only) — Task 13 relies on rows this route reads existing by then.

- [ ] **Step 1: Write the cron route**

```ts
// app/api/cron/scheduled-reminders/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

type ReminderRow = {
  id: string;
  profileId: string;
  title: string;
  message: string;
  url: string;
  remindAt: string | null;
  dayOfWeek: number | null;
  timeOfDay: string | null;
  timezone: string | null;
  lastSentAt: string | null;
  sentAt: string | null;
};

function localPartsInTimezone(timezone: string, now: Date): { weekday: number; hhmm: string; isoDate: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[get('weekday')] ?? -1,
    hhmm: `${get('hour')}:${get('minute')}`,
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function withinWindow(target: string, current: string, windowMinutes: number): boolean {
  const [targetH, targetM] = target.split(':').map(Number);
  const [curH, curM] = current.split(':').map(Number);
  const targetTotal = targetH * 60 + targetM;
  const curTotal = curH * 60 + curM;
  return curTotal >= targetTotal && curTotal - targetTotal < windowMinutes;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const { data: rows, error } = await supabase
      .from('scheduled_reminders')
      .select('id, profileId, title, message, url, remindAt, dayOfWeek, timeOfDay, timezone, lastSentAt, sentAt');
    if (error) throw error;

    for (const row of (rows ?? []) as ReminderRow[]) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('userId')
          .eq('id', row.profileId)
          .single();
        if (!profile) {
          skipped += 1;
          continue;
        }

        let shouldSend = false;
        let markSentField: 'sentAt' | 'lastSentAt' | null = null;
        let markSentValue: string | null = null;

        if (row.remindAt) {
          // one-off
          if (!row.sentAt && new Date(row.remindAt) <= now) {
            shouldSend = true;
            markSentField = 'sentAt';
            markSentValue = now.toISOString();
          }
        } else if (row.dayOfWeek !== null && row.timeOfDay && row.timezone) {
          // recurring weekly
          const { weekday, hhmm, isoDate } = localPartsInTimezone(row.timezone, now);
          if (weekday === row.dayOfWeek && withinWindow(row.timeOfDay, hhmm, 15) && row.lastSentAt !== isoDate) {
            shouldSend = true;
            markSentField = 'lastSentAt';
            markSentValue = isoDate;
          }
        }

        if (!shouldSend) {
          skipped += 1;
          continue;
        }

        await sendPushToUser(supabase, profile.userId, { title: row.title, message: row.message, url: row.url });

        if (markSentField) {
          await supabase.from('scheduled_reminders').update({ [markSentField]: markSentValue }).eq('id', row.id);
        }
        sent += 1;
      } catch (perRowError) {
        console.error(`scheduled-reminders failed for reminder ${row.id}:`, perRowError);
        errors += 1;
      }
    }

    return NextResponse.json({ sent, skipped, errors });
  } catch (error) {
    console.error('scheduled-reminders cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

The one-off branch checks `sentAt` (not `lastSentAt`, which is reserved for the recurring case) so a one-off reminder never resends once fired.

- [ ] **Step 2: Register the cron schedule**

In `vercel.json`, change:

```json
{
  "crons": [
    { "path": "/api/cron/evening-checkin", "schedule": "0 20 * * *" }
  ]
}
```

to:

```json
{
  "crons": [
    { "path": "/api/cron/evening-checkin", "schedule": "0 20 * * *" },
    { "path": "/api/cron/scheduled-reminders", "schedule": "*/15 * * * *" }
  ]
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 4: Manual cron test**

Using `mcp__supabase__execute_sql`, insert a test row into `scheduled_reminders` with `remindAt` set to a few seconds in the past for a profile that has an active `push_subscriptions` row. Hit `curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/scheduled-reminders` (or locally against `http://localhost:3000` with `CRON_SECRET` set in `.env.local`). Confirm exactly one push arrives, `sent: 1` in the response, and the row's `sentAt` is now set. Hit the endpoint a second time immediately; confirm `sent: 0` (no double-send).

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/scheduled-reminders/route.ts vercel.json
git commit -m "feat: add scheduled-reminders cron for one-off and recurring pushes"
```

---

## Phase 3: Onboarding question, recurring reminder, dashboard banner

### Task 13: Onboarding meal-prep step

**Files:**
- Create: `app/(burnlog)/goals/_components/MealPrepStep.tsx`
- Modify: `app/ai-setup/_components/AiSetupFlow.tsx`

**Interfaces:**
- Consumes: `Profile.mealPrepDayOfWeek`/`mealPrepTime`/`mealPrepTimezone` (Task 1); writes one recurring row to `scheduled_reminders` (dayOfWeek/timeOfDay/timezone set, `remindAt` null) — read by the Task 12 cron.
- Produces: `MealPrepStep({ onContinue, onSkip }: { onContinue: (answers: { dayOfWeek: number; time: string; timezone: string }) => void; onSkip: () => void })`.

- [ ] **Step 1: Seed the `onboarding_page_flags` row for `meal_prep`**

Use `mcp__supabase__execute_sql` with:

```sql
insert into onboarding_page_flags (pageKey, label, isEnabled)
values ('meal_prep', 'Meal Prep Day', true)
on conflict (pageKey) do nothing;
```

Expected: one row inserted (or no-op if already present). Verify: `select * from onboarding_page_flags where pageKey = 'meal_prep';` returns the row.

- [ ] **Step 2: Write `MealPrepStep.tsx`**

```tsx
// app/(burnlog)/goals/_components/MealPrepStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

type MealPrepStepProps = {
  onContinue: (answers: { dayOfWeek: number; time: string; timezone: string }) => void;
  onSkip: () => void;
};

export function MealPrepStep({ onContinue, onSkip }: MealPrepStepProps) {
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [time, setTime] = useState('10:00');

  const handleContinue = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    onContinue({ dayOfWeek, time, timezone });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🍽️ When do you meal-prep?</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll remind you to plan your meals that day.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Day of the week</Label>
          <div className="grid grid-cols-2 gap-2">
            {DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDayOfWeek(d.value)}
                className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  dayOfWeek === d.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onSkip} className="flex-1">Skip</Button>
          <Button onClick={handleContinue} className="flex-1">Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire into `AiSetupFlow.tsx`**

Change:

```tsx
const ORDERED_PAGE_KEYS = ['goals', 'activity_preferences', 'equipment', 'nutrition', 'grocery'] as const;
```

to:

```tsx
const ORDERED_PAGE_KEYS = ['goals', 'activity_preferences', 'equipment', 'nutrition', 'grocery', 'meal_prep'] as const;
```

Add import:

```tsx
import { MealPrepStep } from '@/app/(burnlog)/goals/_components/MealPrepStep';
```

Add state (near `grocery`):

```tsx
  const [mealPrep, setMealPrep] = useState<{ dayOfWeek: number; time: string; timezone: string } | undefined>(undefined);
```

Add handlers (near `handleGroceryContinue`/`handleGrocerySkip`):

```tsx
  const handleMealPrepContinue = (answers: { dayOfWeek: number; time: string; timezone: string }) => {
    setMealPrep(answers);
    advanceFrom('meal_prep');
  };

  const handleMealPrepSkip = () => {
    advanceFrom('meal_prep');
  };
```

Add render block (after the `grocery` block):

```tsx
      {step === 'meal_prep' && (
        <MealPrepStep onContinue={handleMealPrepContinue} onSkip={handleMealPrepSkip} />
      )}
```

- [ ] **Step 4: Persist `mealPrep` in `handleSave`**

In `handleSave`, after the existing `profiles` update block, add a conditional second update + reminder upsert. Change:

```tsx
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle: fullLifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;
```

to:

```tsx
      const profileUpdate: Record<string, unknown> = { aiEnabled: true, lifestyle: fullLifestyle };
      if (mealPrep) {
        profileUpdate.mealPrepDayOfWeek = mealPrep.dayOfWeek;
        profileUpdate.mealPrepTime = mealPrep.time;
        profileUpdate.mealPrepTimezone = mealPrep.timezone;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', profileId);
      if (profileError) throw profileError;

      if (mealPrep) {
        // scheduled_reminders has no unique constraint on profileId (unlike
        // grocery_lists), so this is a delete-then-insert rather than an upsert.
        await supabase
          .from('scheduled_reminders')
          .delete()
          .eq('profileId', profileId)
          .eq('title', 'Time to plan your meals 🍽️');
        const { error: reminderError } = await supabase.from('scheduled_reminders').insert({
          profileId,
          title: 'Time to plan your meals 🍽️',
          message: 'It\'s your meal-prep day — open the Meal Planner to plan this week.',
          url: '/meal-planner',
          dayOfWeek: mealPrep.dayOfWeek,
          timeOfDay: mealPrep.time,
          timezone: mealPrep.timezone,
        });
        if (reminderError) console.error('meal-prep reminder insert failed:', reminderError);
      }
```

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: succeeds. Manual walkthrough: run `/ai-setup`, confirm a "Meal Prep Day" step appears after Grocery (toggle-able via `OnboardingPageTogglesModal` on the profile page), pick Sunday 10:00, complete the flow, and confirm via `mcp__supabase__execute_sql` that `profiles.mealPrepDayOfWeek = 0` and a `scheduled_reminders` row with `dayOfWeek = 0, timeOfDay = '10:00'` exists.

- [ ] **Step 6: Commit**

```bash
git add "app/(burnlog)/goals/_components/MealPrepStep.tsx" app/ai-setup/_components/AiSetupFlow.tsx
git commit -m "feat: add meal-prep day onboarding step and recurring reminder"
```

---

### Task 14: Dashboard "Plan your meals" banner

**Files:**
- Create: `app/(burnlog)/dashboard/_components/MealPrepBanner.tsx`
- Modify: `app/(burnlog)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `Profile.mealPrepDayOfWeek`/`lastMealPlanGeneratedAt` (Task 1, already included via the page's existing `select('*')`); `Link` from `next/link`.
- Produces: `MealPrepBanner({ mealPrepDayOfWeek, lastMealPlanGeneratedAt }: { mealPrepDayOfWeek: number | null; lastMealPlanGeneratedAt: string | null })`.

- [ ] **Step 1: Write `MealPrepBanner.tsx`**

```tsx
// app/(burnlog)/dashboard/_components/MealPrepBanner.tsx
'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type MealPrepBannerProps = {
  mealPrepDayOfWeek: number | null;
  lastMealPlanGeneratedAt: string | null;
};

function startOfThisWeek(): Date {
  const now = new Date();
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  result.setDate(result.getDate() - result.getDay()); // back to Sunday
  return result;
}

export function MealPrepBanner({ mealPrepDayOfWeek, lastMealPlanGeneratedAt }: MealPrepBannerProps) {
  if (mealPrepDayOfWeek === null) return null;

  const today = new Date();
  if (today.getDay() !== mealPrepDayOfWeek) return null;

  const generatedAt = lastMealPlanGeneratedAt ? new Date(lastMealPlanGeneratedAt) : null;
  const alreadyPlannedThisWeek = generatedAt !== null && generatedAt >= startOfThisWeek();
  if (alreadyPlannedThisWeek) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="py-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">🍽️ Time to plan this week&apos;s meals</p>
          <p className="text-xs text-muted-foreground">Today&apos;s your meal-prep day.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/meal-planner">Plan now</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `app/(burnlog)/dashboard/page.tsx`**

Add import near the other `./_components/*` imports:

```tsx
import { MealPrepBanner } from './_components/MealPrepBanner';
```

Render it above `DailyRingsWidget` (find the existing `<DailyRingsWidget profileId={userProfile.id} refreshKey={refreshKey} />` line and add directly before it):

```tsx
          <MealPrepBanner
            mealPrepDayOfWeek={userProfile.mealPrepDayOfWeek ?? null}
            lastMealPlanGeneratedAt={userProfile.lastMealPlanGeneratedAt ?? null}
          />

          <DailyRingsWidget profileId={userProfile.id} refreshKey={refreshKey} />
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds. Manual verification: with a test profile's `mealPrepDayOfWeek` set to today's weekday and `lastMealPlanGeneratedAt` null (via `mcp__supabase__execute_sql`), confirm the banner shows on `/dashboard` and "Plan now" links to `/meal-planner`. Set `lastMealPlanGeneratedAt` to now and confirm the banner disappears on reload.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/dashboard"
git commit -m "feat: add meal-prep day dashboard banner"
```

---

### Task 15: Profile settings — edit meal-prep day/time

**Files:**
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: same delete-then-insert `scheduled_reminders` pattern as Task 13 Step 4.

- [ ] **Step 1: Add meal-prep fields to the profile query**

Find the existing `.select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,avatarUrl,waterUnit,glassSizeMl,waterGoalMl,username')` call and extend it to also select `mealPrepDayOfWeek,mealPrepTime,mealPrepTimezone`:

```tsx
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,avatarUrl,waterUnit,glassSizeMl,waterGoalMl,username,mealPrepDayOfWeek,mealPrepTime,mealPrepTimezone')
```

- [ ] **Step 2: Add a settings block and handler**

Add this handler near `handleWaterSettingChange`:

```tsx
  const handleMealPrepChange = async (dayOfWeek: number, time: string) => {
    if (!profile) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await supabase
      .from('profiles')
      .update({ mealPrepDayOfWeek: dayOfWeek, mealPrepTime: time, mealPrepTimezone: timezone })
      .eq('id', profile.id);
    await supabase
      .from('scheduled_reminders')
      .delete()
      .eq('profileId', profile.id)
      .eq('title', 'Time to plan your meals 🍽️');
    await supabase.from('scheduled_reminders').insert({
      profileId: profile.id,
      title: 'Time to plan your meals 🍽️',
      message: 'It\'s your meal-prep day — open the Meal Planner to plan this week.',
      url: '/meal-planner',
      dayOfWeek,
      timeOfDay: time,
      timezone,
    });
    setProfile((prev: any) => ({ ...prev, mealPrepDayOfWeek: dayOfWeek, mealPrepTime: time, mealPrepTimezone: timezone }));
  };
```

Add the settings block JSX near the existing water-tracker settings block (same section of the page — find where `waterUnit`/`glassSizeMl`/`waterGoalMl` controls are rendered and add a sibling block after it):

```tsx
                <div className="space-y-3 pt-4 border-t">
                  <p className="text-sm font-medium">🍽️ Meal-prep day</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, value) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleMealPrepChange(value, profile.mealPrepTime ?? '10:00')}
                        className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                          profile.mealPrepDayOfWeek === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="time"
                    defaultValue={profile.mealPrepTime ?? '10:00'}
                    onBlur={(e) => handleMealPrepChange(profile.mealPrepDayOfWeek ?? 0, e.target.value)}
                  />
                </div>
```

(`Input` is already imported on this page via the water-settings block.)

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: succeeds. Manual verification: on `/profile`, change the meal-prep day/time, reload, confirm the selection persists and `mcp__supabase__execute_sql` shows exactly one `scheduled_reminders` row titled "Time to plan your meals 🍽️" for that profile (no duplicates after repeated edits).

- [ ] **Step 4: Commit**

```bash
git add app/profile/page.tsx
git commit -m "feat: allow editing meal-prep day/time from profile settings"
```

---

## Final Verification Checklist

- [ ] `npx tsc --noEmit` and `npx next build` both succeed with no errors.
- [ ] `mcp__supabase__list_tables` shows `grocery_lists` and `scheduled_reminders` with `rls_enabled: true`.
- [ ] `/meal-planner` end-to-end: store (incl. manual-ingredients bypass) → household/cook-mode → cuisine/surprise-me → appliances (incl. "not cooking at home") → AI candidates → selection → week grid with a verified swap → grocery list persisted to `grocery_lists` → shopping-day reminder inserted into `scheduled_reminders`.
- [ ] `/meal-planner/grocery-list` renders the persisted list directly (not wizard state).
- [ ] `app/api/ai/meal-plan/route.ts` and `MealChecklist.tsx`'s "Generate My Meal Plan" button on `/session` are unaffected — both routes coexist.
- [ ] `/api/cron/scheduled-reminders` sends a due one-off reminder exactly once (no resend on immediate re-hit), and a due recurring reminder exactly once per local calendar day.
- [ ] `/ai-setup` shows the new "Meal Prep Day" step (toggle-able via `OnboardingPageTogglesModal`), and completing it writes `profiles.mealPrepDayOfWeek/mealPrepTime/mealPrepTimezone` plus a recurring `scheduled_reminders` row.
- [ ] `/dashboard` shows the meal-prep banner only on the configured day, only when `lastMealPlanGeneratedAt` predates this week.
- [ ] `/profile` can edit the meal-prep day/time without creating duplicate `scheduled_reminders` rows.
