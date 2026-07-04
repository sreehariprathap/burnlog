# AI Lifestyle Questionnaire → Workout Plan Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new (or existing) user opt into AI, answer a short lifestyle questionnaire, and get an AI-generated 7-day workout plan they can edit and save.

**Architecture:** A server-only OpenRouter client (`lib/ai/openrouter.ts`) is called from an auth-gated API route (`app/api/ai/workout-plan/route.ts`), which is in turn called from a new client-rendered flow (`app/ai-setup`) reached from signup (new users) or the Profile page (existing users opting in later). Nothing is written to the database until the user explicitly confirms the generated plan in a preview/edit screen.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Auth, via `@supabase/auth-helpers-nextjs`), Prisma (schema/migrations only — all runtime queries go through the Supabase client, matching existing codebase convention), `openai` npm SDK pointed at OpenRouter.

## Global Constraints

- Model: `openai/gpt-oss-120b:free` via OpenRouter, overridable by env var `AI_WORKOUT_MODEL` — never hardcoded without an override path.
- API key: `process.env.NEXT_OPENROUTER_KEY` (already present in `.env`) — server-only, never referenced from a client component.
- Body part vocabulary is fixed and must match `app/session/_components/AddWorkoutModal.tsx` exactly: `Push`, `Pull`, `Legs`, `Full Body`, `Cardio`, `Rest`.
- `dayOfWeek` convention: `0=Sun … 6=Sat` (matches `workout_plans.dayOfWeek` and `new Date().getDay()` usage elsewhere in the app).
- No test framework is configured in this repo (no jest/vitest, no `test` script). Verification in this plan uses `tsc --noEmit`, direct SQL checks against Supabase (via the `mcp__supabase__execute_sql` tool), and manual browser walkthroughs (via the chrome-devtools MCP tool) — this matches how all prior work in this codebase has been verified.
- All client-side Supabase calls MUST use `createClientComponentClient()` from `@supabase/auth-helpers-nextjs` (never the plain `supabase` singleton from `lib/supabase.ts` — that client has no cookie-synced session and silently fails RLS checks; this exact bug was just fixed elsewhere in this codebase).
- Never trust a client-supplied user/profile id in server code — always derive it from the authenticated session (`supabase.auth.getUser()`).
- Any disposable test user created for verification must be deleted afterward (`delete from auth.users where email = '...'`), along with any orphaned `profiles`/`workout_plans` rows it left behind (no FK cascade exists from `auth.users` to `profiles` in this schema).

---

### Task 1: Profile schema — `aiEnabled` + `lifestyle`

**Files:**
- Modify: `prisma/schema.prisma` (the `Profile` model, currently lines 10–31)

**Interfaces:**
- Produces: `profiles.aiEnabled` (boolean, default `false`), `profiles.lifestyle` (nullable JSON) — columns consumed by Task 4 (API route reads profile), Task 5 (save writes these), Task 6 (Profile page reads `aiEnabled`).

- [ ] **Step 1: Add the two fields to the Profile model**

In `prisma/schema.prisma`, find the `Profile` model (starts `/// user profile` then `model Profile {`). Add these two lines right after `activityLevel String`:

```prisma
  activityLevel String
  aiEnabled     Boolean  @default(false)
  lifestyle     Json?
```

- [ ] **Step 2: Push the schema to Supabase**

Run: `npx prisma db push`
Expected output includes: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Verify the columns exist**

Use the `mcp__supabase__execute_sql` tool with:
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'profiles' and column_name in ('aiEnabled', 'lifestyle');
```
Expected: two rows — `aiEnabled` (`boolean`, not nullable, default `false`), `lifestyle` (`jsonb`, nullable).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
Add aiEnabled and lifestyle fields to Profile

Foundation for the AI opt-in gate: aiEnabled defaults false so no
existing user is affected until they explicitly opt in.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared AI types

**Files:**
- Create: `lib/ai/types.ts`

**Interfaces:**
- Produces: `BODY_PARTS` (const array), `BodyPart` (type), `WorkoutPlanEntry` (type: `{ dayOfWeek: number; bodyPart: BodyPart }`), `LifestyleAnswers` (type). Consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Create the types file**

```ts
// lib/ai/types.ts

export const BODY_PARTS = ['Push', 'Pull', 'Legs', 'Full Body', 'Cardio', 'Rest'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export type WorkoutPlanEntry = {
  dayOfWeek: number; // 0=Sun ... 6=Sat
  bodyPart: BodyPart;
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
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/types.ts
git commit -m "$(cat <<'EOF'
Add shared types for AI workout plan generation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: OpenRouter client + plan generation

**Files:**
- Create: `lib/ai/openrouter.ts`
- Delete: `lib/openai.ts` (dead code — unused anywhere in the codebase, hardcodes `gpt-4` against OpenAI's own API; this task replaces it)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `BODY_PARTS`, `BodyPart`, `WorkoutPlanEntry`, `LifestyleAnswers` from `lib/ai/types.ts` (Task 2)
- Produces: `generateWorkoutPlan(profile: { age: number; weight: number; height: number; activityLevel: string }, lifestyle: LifestyleAnswers): Promise<WorkoutPlanEntry[]>` — throws an `Error` with a descriptive message on any failure (network, malformed JSON, invalid shape). Consumed by Task 4.

- [ ] **Step 1: Confirm nothing imports the file being deleted**

Run: `grep -rn "lib/openai" app lib --include="*.ts" --include="*.tsx"`
Expected: no output (confirms it's safe to delete).

- [ ] **Step 2: Delete the dead file**

```bash
rm lib/openai.ts
```

- [ ] **Step 3: Create the OpenRouter client + generator**

```ts
// lib/ai/openrouter.ts
import OpenAI from 'openai';
import { BODY_PARTS, type BodyPart, type LifestyleAnswers, type WorkoutPlanEntry } from './types';

const MODEL = process.env.AI_WORKOUT_MODEL || 'openai/gpt-oss-120b:free';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

type ProfileContext = {
  age: number;
  weight: number;
  height: number;
  activityLevel: string;
};

const JOB_TYPE_LABEL: Record<LifestyleAnswers['jobType'], string> = {
  desk: 'Desk job (mostly sitting)',
  physical: 'Physical labor (mostly standing/moving)',
  mixed: 'Mixed (some sitting, some physical activity)',
  not_working: 'Not currently working',
};

const COMMUTE_LABEL: Record<LifestyleAnswers['commuteActivity'], string> = {
  sedentary: 'Sedentary (car/public transit)',
  walk_or_bike: 'Walks or bikes',
};

const EXERCISE_FREQUENCY_LABEL: Record<LifestyleAnswers['exerciseFrequency'], string> = {
  none: 'None',
  '1-2': '1-2 times per week',
  '3-4': '3-4 times per week',
  '5+': '5 or more times per week',
};

const GOAL_FOCUS_LABEL: Record<LifestyleAnswers['goalFocus'], string> = {
  lose_weight: 'Lose weight',
  build_muscle: 'Build muscle',
  improve_stamina: 'Improve stamina',
  general_health: 'General health',
  athletic_performance: 'Athletic performance',
};

function buildPrompt(profile: ProfileContext, lifestyle: LifestyleAnswers): string {
  const restDays = 7 - lifestyle.preferredTrainingDays;
  return `You are a certified personal trainer generating a weekly workout schedule.

User profile:
- Age: ${profile.age}
- Weight: ${profile.weight} kg
- Height: ${profile.height} cm
- Self-reported activity level: ${profile.activityLevel}

Lifestyle:
- Job type: ${JOB_TYPE_LABEL[lifestyle.jobType]}
- Hours sitting per day: ${lifestyle.hoursSitting}
- Commute activity: ${COMMUTE_LABEL[lifestyle.commuteActivity]}
- Current exercise frequency: ${EXERCISE_FREQUENCY_LABEL[lifestyle.exerciseFrequency]}
- Primary goal: ${GOAL_FOCUS_LABEL[lifestyle.goalFocus]}
- Injuries or limitations: ${lifestyle.injuries || 'None reported'}
- Preferred training days per week: ${lifestyle.preferredTrainingDays}

Generate a 7-day workout schedule, one entry per day of the week (dayOfWeek 0=Sunday through
6=Saturday). Exactly ${lifestyle.preferredTrainingDays} days must have a non-"Rest" bodyPart;
the remaining ${restDays} days must be "Rest". Choose which body parts to train and how to
distribute them across the week based on the user's goal and lifestyle above (e.g. avoid
scheduling the same body part on consecutive days where reasonable, and take injuries or
limitations into account when picking body parts).

Each entry's "bodyPart" must be exactly one of: ${BODY_PARTS.join(', ')}.

Respond with ONLY a JSON object of this exact shape, no other text, no markdown code fences:
{"plan":[{"dayOfWeek":0,"bodyPart":"Rest"},{"dayOfWeek":1,"bodyPart":"Push"}, ... one entry for every day 0-6]}`;
}

function validatePlan(raw: unknown): WorkoutPlanEntry[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { plan?: unknown }).plan)) {
    throw new Error('AI response missing a "plan" array');
  }
  const plan = (raw as { plan: unknown[] }).plan;
  if (plan.length !== 7) {
    throw new Error(`AI response has ${plan.length} entries, expected 7`);
  }

  const seenDays = new Set<number>();
  const result: WorkoutPlanEntry[] = [];
  for (const entry of plan) {
    const dayOfWeek = (entry as { dayOfWeek?: unknown } | null)?.dayOfWeek;
    const bodyPart = (entry as { bodyPart?: unknown } | null)?.bodyPart;

    if (
      typeof dayOfWeek !== 'number' ||
      typeof bodyPart !== 'string' ||
      !(BODY_PARTS as readonly string[]).includes(bodyPart)
    ) {
      throw new Error('AI response contains a malformed plan entry');
    }
    if (dayOfWeek < 0 || dayOfWeek > 6 || seenDays.has(dayOfWeek)) {
      throw new Error(`AI response has an invalid or duplicate dayOfWeek: ${dayOfWeek}`);
    }
    seenDays.add(dayOfWeek);
    result.push({ dayOfWeek, bodyPart: bodyPart as BodyPart });
  }

  if (seenDays.size !== 7) {
    throw new Error('AI response does not cover all 7 days of the week');
  }
  return result.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export async function generateWorkoutPlan(
  profile: ProfileContext,
  lifestyle: LifestyleAnswers
): Promise<WorkoutPlanEntry[]> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    messages: [{ role: 'user', content: buildPrompt(profile, lifestyle) }],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI response had no content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI response was not valid JSON');
  }

  return validatePlan(parsed);
}
```

- [ ] **Step 4: Add env var documentation**

In `.env.example`, after the `OPENAI_API_KEY=` line, add:

```
# AI workout plan generation (OpenRouter). Get a free key at https://openrouter.ai/keys
NEXT_OPENROUTER_KEY=
# Optional: override the default free model (openai/gpt-oss-120b:free)
AI_WORKOUT_MODEL=
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/openrouter.ts .env.example
git rm lib/openai.ts
git commit -m "$(cat <<'EOF'
Add OpenRouter-backed workout plan generator

Replaces the unused lib/openai.ts (dead code, wrong model, wrong
provider) with a server-only OpenRouter client that generates and
strictly validates a 7-day workout plan.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: API route

**Files:**
- Create: `app/api/ai/workout-plan/route.ts`

**Interfaces:**
- Consumes: `generateWorkoutPlan` from `lib/ai/openrouter.ts` (Task 3), `LifestyleAnswers` from `lib/ai/types.ts` (Task 2)
- Produces: `POST /api/ai/workout-plan` — body is a `LifestyleAnswers` JSON object, response is `{ plan: WorkoutPlanEntry[] }` on success (200) or `{ error: string }` on failure (400/401/404/502/500). Consumed by Task 5's `AiSetupFlow`.

- [ ] **Step 1: Create the route**

```ts
// app/api/ai/workout-plan/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateWorkoutPlan } from '@/lib/ai/openrouter';
import type { LifestyleAnswers } from '@/lib/ai/types';

function isValidLifestyleAnswers(body: unknown): body is LifestyleAnswers {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.jobType === 'string' &&
    typeof b.hoursSitting === 'string' &&
    typeof b.commuteActivity === 'string' &&
    typeof b.exerciseFrequency === 'string' &&
    typeof b.goalFocus === 'string' &&
    typeof b.injuries === 'string' &&
    typeof b.preferredTrainingDays === 'number' &&
    b.preferredTrainingDays >= 3 &&
    b.preferredTrainingDays <= 6
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isValidLifestyleAnswers(body)) {
      return NextResponse.json({ error: 'Invalid lifestyle answers' }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('age, weight, height, activityLevel')
      .eq('userId', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    try {
      const plan = await generateWorkoutPlan(profile, body);
      return NextResponse.json({ plan });
    } catch (firstError) {
      console.error('AI plan generation failed, retrying once:', firstError);
      try {
        const plan = await generateWorkoutPlan(profile, body);
        return NextResponse.json({ plan });
      } catch (secondError) {
        console.error('AI plan generation failed on retry:', secondError);
        const message = secondError instanceof Error ? secondError.message : 'AI generation failed';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }
  } catch (error) {
    console.error('Unexpected error in /api/ai/workout-plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the auth gate (no session)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/ai/workout-plan -H "Content-Type: application/json" -d '{}'`
Expected: `401`
(Requires `npm run dev` already running.)

- [ ] **Step 4: Create a disposable test user for the happy-path check**

Use `mcp__supabase__execute_sql`:
```sql
do $$
declare
  new_user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    'ai-plan-verify@example.com', crypt('AiPlanVerify123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );
  insert into auth.identities (provider, provider_id, user_id, identity_data, created_at, updated_at, last_sign_in_at)
  values (
    'email', new_user_id, new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'ai-plan-verify@example.com', 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );
  insert into profiles ("userId", "firstName", "lastName", age, weight, height, "activityLevel")
  values (new_user_id, 'Plan', 'Verify', 28, 72, 176, 'moderate');
end $$;
```

- [ ] **Step 5: Log in as the test user via browser and call the route directly**

Use the chrome-devtools MCP tool: navigate to `http://localhost:3000/login`, fill in `ai-plan-verify@example.com` / `AiPlanVerify123!`, submit. This lands on `/dashboard` (profile already exists). Then use `mcp__chrome-devtools__evaluate_script` with:

```js
async () => {
  const res = await fetch('/api/ai/workout-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobType: 'desk',
      hoursSitting: '6-8',
      commuteActivity: 'sedentary',
      exerciseFrequency: '1-2',
      goalFocus: 'general_health',
      injuries: '',
      preferredTrainingDays: 4,
    }),
  });
  return { status: res.status, body: await res.json() };
}
```
Expected: `status: 200`, `body.plan` is an array of exactly 7 objects, each with `dayOfWeek` 0-6 (all present, no duplicates) and `bodyPart` one of `Push`/`Pull`/`Legs`/`Full Body`/`Cardio`/`Rest`, and exactly 4 of them non-`Rest` (matching `preferredTrainingDays: 4`).

- [ ] **Step 6: Verify the failure/retry path**

Temporarily edit `lib/ai/openrouter.ts`'s `MODEL` line to force a bad value:
```ts
const MODEL = process.env.AI_WORKOUT_MODEL || 'this-model-does-not-exist:free';
```
Save, wait for the dev server to hot-reload, then repeat the `evaluate_script` fetch from Step 5.
Expected: `status: 502`, `body.error` is a non-empty string. Check the terminal running `npm run dev` shows two log lines: "AI plan generation failed, retrying once" then "AI plan generation failed on retry" (confirms the one-retry behavior actually ran twice, not once).

Revert the edit:
```ts
const MODEL = process.env.AI_WORKOUT_MODEL || 'openai/gpt-oss-120b:free';
```

- [ ] **Step 7: Leave the test user in place**

This same test user (`ai-plan-verify@example.com`) is reused for Task 5's verification — do not delete it yet. Final cleanup happens at the end of Task 6.

- [ ] **Step 8: Commit**

```bash
git add app/api/ai/workout-plan/route.ts
git commit -m "$(cat <<'EOF'
Add auth-gated API route for AI workout plan generation

Derives the caller's profile from their own session (never a
client-supplied id), retries once on transient failure, returns a
validated 7-day plan without writing anything to the database.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: AI setup flow UI

**Files:**
- Create: `app/ai-setup/page.tsx`
- Create: `app/ai-setup/_components/AiSetupFlow.tsx`
- Create: `app/ai-setup/_components/ConsentStep.tsx`
- Create: `app/ai-setup/_components/LifestyleForm.tsx`
- Create: `app/ai-setup/_components/PlanPreview.tsx`

**Interfaces:**
- Consumes: `LifestyleAnswers`, `WorkoutPlanEntry`, `BODY_PARTS` from `lib/ai/types.ts` (Task 2); `POST /api/ai/workout-plan` from Task 4.
- Produces: the `/ai-setup` route, reachable by direct navigation (this task) and later wired from signup + Profile page (Task 6). Writes `workout_plans` (7 rows) and `profiles.aiEnabled`/`profiles.lifestyle` on save.

- [ ] **Step 1: Create the consent step component**

```tsx
// app/ai-setup/_components/ConsentStep.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

type ConsentStepProps = {
  onAccept: () => void;
  onDecline: () => void;
};

export function ConsentStep({ onAccept, onDecline }: ConsentStepProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Enable AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          burnlog can use AI (via OpenRouter, an external AI provider) to generate a
          personalized workout plan and future suggestions based on your profile and
          lifestyle answers. Your data is sent to the AI provider only to generate these
          suggestions.
        </p>
        <p className="text-sm text-muted-foreground">
          You can turn this on or off at any time from your Profile page.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onDecline}>Not now</Button>
          <Button onClick={onAccept}>Enable AI Insights</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the lifestyle questionnaire component**

```tsx
// app/ai-setup/_components/LifestyleForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { LifestyleAnswers } from '@/lib/ai/types';

type LifestyleFormProps = {
  submitting: boolean;
  onSubmit: (answers: LifestyleAnswers) => void;
};

export function LifestyleForm({ submitting, onSubmit }: LifestyleFormProps) {
  const [jobType, setJobType] = useState<LifestyleAnswers['jobType']>('desk');
  const [hoursSitting, setHoursSitting] = useState<LifestyleAnswers['hoursSitting']>('4-6');
  const [commuteActivity, setCommuteActivity] = useState<LifestyleAnswers['commuteActivity']>('sedentary');
  const [exerciseFrequency, setExerciseFrequency] = useState<LifestyleAnswers['exerciseFrequency']>('1-2');
  const [goalFocus, setGoalFocus] = useState<LifestyleAnswers['goalFocus']>('general_health');
  const [injuries, setInjuries] = useState('');
  const [preferredTrainingDays, setPreferredTrainingDays] = useState(4);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      jobType,
      hoursSitting,
      commuteActivity,
      exerciseFrequency,
      goalFocus,
      injuries,
      preferredTrainingDays,
    });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Tell us about your lifestyle</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>What kind of work do you do?</Label>
            <Select value={jobType} onValueChange={(v) => setJobType(v as LifestyleAnswers['jobType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desk">Desk job (mostly sitting)</SelectItem>
                <SelectItem value="physical">Physical labor (mostly standing/moving)</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="not_working">Not currently working</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Hours sitting per day</Label>
            <Select value={hoursSitting} onValueChange={(v) => setHoursSitting(v as LifestyleAnswers['hoursSitting'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="<2">Less than 2</SelectItem>
                <SelectItem value="2-4">2-4</SelectItem>
                <SelectItem value="4-6">4-6</SelectItem>
                <SelectItem value="6-8">6-8</SelectItem>
                <SelectItem value="8+">8 or more</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Commute activity</Label>
            <Select value={commuteActivity} onValueChange={(v) => setCommuteActivity(v as LifestyleAnswers['commuteActivity'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Sedentary (car/public transit)</SelectItem>
                <SelectItem value="walk_or_bike">Walk or bike</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Current exercise frequency</Label>
            <Select value={exerciseFrequency} onValueChange={(v) => setExerciseFrequency(v as LifestyleAnswers['exerciseFrequency'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="1-2">1-2x per week</SelectItem>
                <SelectItem value="3-4">3-4x per week</SelectItem>
                <SelectItem value="5+">5+ per week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Primary goal</Label>
            <Select value={goalFocus} onValueChange={(v) => setGoalFocus(v as LifestyleAnswers['goalFocus'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lose_weight">Lose weight</SelectItem>
                <SelectItem value="build_muscle">Build muscle</SelectItem>
                <SelectItem value="improve_stamina">Improve stamina</SelectItem>
                <SelectItem value="general_health">General health</SelectItem>
                <SelectItem value="athletic_performance">Athletic performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="injuries">Injuries or physical limitations (optional)</Label>
            <textarea
              id="injuries"
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              className="w-full p-2 border rounded-md h-20"
              placeholder="e.g. bad left knee, avoid heavy overhead lifting"
            />
          </div>

          <div className="space-y-2">
            <Label>Preferred training days per week: {preferredTrainingDays}</Label>
            <input
              type="range"
              min={3}
              max={6}
              step={1}
              value={preferredTrainingDays}
              onChange={(e) => setPreferredTrainingDays(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Generate My Plan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the plan preview/edit component**

```tsx
// app/ai-setup/_components/PlanPreview.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { BODY_PARTS, type WorkoutPlanEntry } from '@/lib/ai/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type PlanPreviewProps = {
  plan: WorkoutPlanEntry[];
  saving: boolean;
  regenerating: boolean;
  onChange: (plan: WorkoutPlanEntry[]) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
};

export function PlanPreview({
  plan,
  saving,
  regenerating,
  onChange,
  onSave,
  onRegenerate,
  onCancel,
}: PlanPreviewProps) {
  const setDayBodyPart = (dayOfWeek: number, bodyPart: WorkoutPlanEntry['bodyPart']) => {
    onChange(plan.map((entry) => (entry.dayOfWeek === dayOfWeek ? { ...entry, bodyPart } : entry)));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Your AI-generated weekly plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Review your week below. Tap any day to change it before saving.
        </p>
        <div className="space-y-3">
          {plan
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((entry) => (
              <div key={entry.dayOfWeek} className="flex items-center justify-between gap-2">
                <span className="w-10 font-medium">{DAY_LABELS[entry.dayOfWeek]}</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {BODY_PARTS.map((bp) => (
                    <button
                      key={bp}
                      type="button"
                      onClick={() => setDayBodyPart(entry.dayOfWeek, bp)}
                      className={`px-2 py-1 text-xs rounded-md border ${
                        entry.bodyPart === bp
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'border-gray-300 text-gray-700'
                      }`}
                    >
                      {bp}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onCancel} disabled={saving || regenerating}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onRegenerate} disabled={saving || regenerating}>
              {regenerating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Regenerate
            </Button>
            <Button onClick={onSave} disabled={saving || regenerating}>
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Save Plan
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the orchestrator**

```tsx
// app/ai-setup/_components/AiSetupFlow.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsentStep } from './ConsentStep';
import { LifestyleForm } from './LifestyleForm';
import { PlanPreview } from './PlanPreview';
import type { LifestyleAnswers, WorkoutPlanEntry } from '@/lib/ai/types';

type Step = 'loading' | 'consent' | 'questionnaire' | 'generating' | 'preview' | 'error';

export function AiSetupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/dashboard';
  const supabase = createClientComponentClient();

  const [step, setStep] = useState<Step>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
  const [plan, setPlan] = useState<WorkoutPlanEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', user.id)
        .single();

      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      setStep('consent');
    })();
  }, [supabase, router]);

  const requestPlan = async (answers: LifestyleAnswers) => {
    setErrorMessage(null);
    try {
      const response = await fetch('/api/ai/workout-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Failed to generate a plan');
      }
      setPlan(body.plan as WorkoutPlanEntry[]);
      setStep('preview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate a plan');
      setStep('error');
    }
  };

  const handleQuestionnaireSubmit = async (answers: LifestyleAnswers) => {
    setLifestyle(answers);
    setStep('generating');
    await requestPlan(answers);
  };

  const handleRegenerate = async () => {
    if (!lifestyle) return;
    setRegenerating(true);
    await requestPlan(lifestyle);
    setRegenerating(false);
  };

  const handleRetry = async () => {
    if (!lifestyle) return;
    setStep('generating');
    await requestPlan(lifestyle);
  };

  const handleSkip = () => {
    router.push(returnTo);
  };

  const handleSave = async () => {
    if (!plan || !profileId || !lifestyle) return;
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

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;

      router.push(returnTo);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save your plan');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      {step === 'consent' && (
        <ConsentStep onAccept={() => setStep('questionnaire')} onDecline={handleSkip} />
      )}

      {step === 'questionnaire' && (
        <LifestyleForm submitting={false} onSubmit={handleQuestionnaireSubmit} />
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin h-8 w-8" />
          <p className="text-sm text-muted-foreground">Generating your personalized plan…</p>
        </div>
      )}

      {step === 'preview' && plan && (
        <PlanPreview
          plan={plan}
          saving={saving}
          regenerating={regenerating}
          onChange={setPlan}
          onSave={handleSave}
          onRegenerate={handleRegenerate}
          onCancel={handleSkip}
        />
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleSkip}>Skip for now</Button>
            <Button onClick={handleRetry}>Try Again</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create the page (Suspense wrapper for `useSearchParams`)**

```tsx
// app/ai-setup/page.tsx
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AiSetupFlow } from './_components/AiSetupFlow';

export default function AiSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <AiSetupFlow />
    </Suspense>
  );
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Full flow verification in the browser**

Using the chrome-devtools MCP tool, logged in as `ai-plan-verify@example.com` (created in Task 4, still present) with the local `npm run dev` server running:

1. Navigate to `http://localhost:3000/ai-setup`.
2. Confirm the Consent step renders. Click "Enable AI Insights".
3. Confirm the questionnaire renders. Fill it out (any valid values) and click "Generate My Plan".
4. Confirm a loading state appears, then the Preview screen renders with 7 days shown.
5. Click a body-part button on one day to change it; confirm the UI updates immediately.
6. Click "Save Plan".
7. Confirm redirect to `/dashboard` (default `returnTo`).
8. Use `mcp__supabase__execute_sql` to verify:
   ```sql
   select wp.* from workout_plans wp
   join profiles p on p.id = wp."profileId"
   join auth.users u on u.id = p."userId"
   where u.email = 'ai-plan-verify@example.com'
   order by wp."dayOfWeek";
   ```
   Expected: exactly 7 rows, `dayOfWeek` 0-6 each appearing once, `repeatWeekly = true`, and the one day you edited in step 5 reflects your edit.
   ```sql
   select "aiEnabled", "lifestyle" from profiles p
   join auth.users u on u.id = p."userId"
   where u.email = 'ai-plan-verify@example.com';
   ```
   Expected: `aiEnabled = true`, `lifestyle` contains the answers submitted in step 3.
9. Navigate to `http://localhost:3000/session` and confirm at least one day now shows the AI-generated body part (matching one of the 7 rows above).

- [ ] **Step 8: Verify the cancel/skip path writes nothing**

Navigate to `http://localhost:3000/ai-setup` again (same test user). Go through Consent → Questionnaire → Generate → Preview, then click **Cancel** instead of Save.
Confirm redirect to `/dashboard`. Use `mcp__supabase__execute_sql` to confirm `profiles.aiEnabled` is unchanged (still whatever it was from Step 7 — this step is about confirming Cancel doesn't call the save logic again, not about resetting state).

- [ ] **Step 9: Commit**

```bash
git add app/ai-setup
git commit -m "$(cat <<'EOF'
Add AI setup flow: consent, questionnaire, plan preview/edit

Nothing is written to the database until the user explicitly clicks
Save Plan on the preview screen.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire entry points + final verification

**Files:**
- Modify: `app/signup/profile/page.tsx` (the `handleSave` success branch, currently `router.push('/dashboard');`)
- Modify: `app/profile/page.tsx` (add an "AI Insights" card)

**Interfaces:**
- Consumes: `/ai-setup` route from Task 5.

- [ ] **Step 1: Redirect new signups to `/ai-setup`**

In `app/signup/profile/page.tsx`, inside `handleSave`, change:
```ts
      } else {
        router.push('/dashboard');
      }
```
to:
```ts
      } else {
        router.push('/ai-setup');
      }
```
(This is the branch right after a successful profile `insert` — do not touch the other `router.replace('/dashboard')` in the `checkSessionAndProfile` effect, which handles the "profile already exists" case and should keep going straight to the dashboard.)

- [ ] **Step 2: Add an AI Insights card to the Profile page**

In `app/profile/page.tsx`:

Add `Sparkles` to the lucide-react import:
```ts
import { Loader2, Info, AlertTriangle, Sparkles } from 'lucide-react';
```

Extend the profile select to include `aiEnabled`:
```ts
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('firstName,lastName,age,weight,height,activityLevel,aiEnabled')
          .eq('userId', userId)
          .single();
```

Add a new card right after the closing `</div>` of the `grid grid-cols-1 md:grid-cols-2 gap-6` block (i.e. right before the `<div className="mt-6 text-center">` logout section):
```tsx
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    AI Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {profile.aiEnabled
                      ? 'AI-powered suggestions are enabled for your account.'
                      : 'Enable AI to get a personalized workout plan based on your lifestyle.'}
                  </p>
                  {!profile.aiEnabled && (
                    <Button onClick={() => router.push('/ai-setup?returnTo=/profile')}>
                      Enable AI Insights
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the signup entry point end-to-end**

Create a second disposable test user via `mcp__supabase__execute_sql` (same pattern as Task 4 Step 4, different email, e.g. `signup-flow-verify@example.com`, but this time do **not** insert a `profiles` row — the point is to go through the real `/signup/profile` form).

Using chrome-devtools MCP: log in as this user (lands on `/signup/profile` since no profile exists yet). Fill out the profile form and save. Confirm it redirects to `/ai-setup` (not `/dashboard`) and the Consent step renders. Click "Not now". Confirm redirect to `/dashboard` (the default `returnTo`). Verify via SQL that this user's `profiles.aiEnabled` is `false`.

- [ ] **Step 5: Verify the Profile-page re-entry path**

Still logged in as `signup-flow-verify@example.com`, navigate to `http://localhost:3000/profile`. Confirm the AI Insights card shows the disabled message and an "Enable AI Insights" button. Click it, confirm navigation to `/ai-setup?returnTo=/profile`. Go through Consent (accept) → Questionnaire → Preview → Save. Confirm redirect back to `/profile` (not `/dashboard`), and that the card now shows the enabled message with no button.

- [ ] **Step 6: Final cleanup — delete all test data**

Use `mcp__supabase__execute_sql`:
```sql
delete from workout_plans where "profileId" in (
  select p.id from profiles p
  join auth.users u on u.id = p."userId"
  where u.email in ('ai-plan-verify@example.com', 'signup-flow-verify@example.com')
);
delete from profiles where "userId" in (
  select id from auth.users where email in ('ai-plan-verify@example.com', 'signup-flow-verify@example.com')
);
delete from auth.users where email in ('ai-plan-verify@example.com', 'signup-flow-verify@example.com');
```
Verify with a final `select count(*) from auth.users where email like '%verify@example.com'` — expect `0`.

- [ ] **Step 7: Final full-repo typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/signup/profile/page.tsx app/profile/page.tsx
git commit -m "$(cat <<'EOF'
Wire AI setup into signup and Profile page

New signups land on /ai-setup after profile creation; existing users
can opt in later from a new AI Insights card on /profile.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
