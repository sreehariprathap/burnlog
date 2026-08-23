# 8-Week Program Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste a freeform multi-week transformation plan (like the one that inspired this feature), have AI structure it into a persisted `Program` + weekly checklists, and track progress against it — header stats, a ridge-line progress visualization, rules, nutrition guidance, the weekday template, and a week-by-week accordion — as a third tab on the existing Plan page.

**Architecture:** Two new tables (`Program`, `ProgramWeek`) plus reuse of the existing `workout_plans` table for the weekday template. AI ingestion follows the exact prompt→validate→retry pattern already established by `lib/ai/openrouter.ts`/`app/api/ai/workout-plan/route.ts`. All new UI is additive — a new `ProgramView` orchestrator plus small presentational pieces (`RidgeProgress`, `ProgramWeekAccordion`, `ProgramCreateFlow`) wired into the Plan page's existing Day/Month toggle as a third tab.

**Tech Stack:** Next.js client components + one API route, `@supabase/auth-helpers-nextjs`, Prisma, `openai` SDK (via OpenRouter, existing pattern), `lucide-react`, Tailwind CSS, inline SVG.

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing via Chrome DevTools MCP.
- Schema changes via `npx prisma db push`. RLS applied via `mcp__supabase__execute_sql`, then mirrored into `supabase/rls.sql` (append `'programs'` and `'program_weeks'` to the existing owner-access table array — do not re-run that `do $$` loop against the live database for tables it already covers).
- **Do not touch** `app/(burnlog)/session/_components/PlanCard.tsx`, `MealChecklist.tsx`, `CompletionTracker.tsx`, or any file under `session-loggers/` — these are under active concurrent modification outside this plan. The only existing file this plan modifies is `app/(burnlog)/session/page.tsx` (add a third tab branch) and `components/kokonutui/plan-view-toggle.tsx` (add a third tab item).
- Do not rebuild meal-plan tracking — `MealPlanEntry`/`MealPlanCheckIn`/`MealChecklist.tsx` already cover day-specific, checkable meal plans. `Program.mealPlan` is general nutrition *guidance* text, not a duplicate daily roster.
- Brand color palette only (`--primary`, `--chart-1..5` theme tokens) — no arbitrary/off-palette Tailwind colors (multiple earlier tasks this session were fixed for this exact mistake).
- One active `Program` per profile (`profileId @unique`); creating a new one replaces the old one (cascade-deletes its weeks).

---

### Task 1: Program schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Produces: `Program { id, profileId (unique), title, subtitle, totalWeeks, startWeight, targetWeight, startDate, rules (Json), mealPlan (Json), createdAt }` (table `programs`). `ProgramWeek { id, programId, weekIndex, title, subtitle, socialActivity, soloActivity, checklist (Json), milestoneAwarded }` (table `program_weeks`, `onDelete: Cascade` on `programId`).

- [ ] **Step 1: Add the schema**

In `prisma/schema.prisma`, add `Program Program?` to the `Profile` model's relations list (alongside `MealPlanCheckIn MealPlanCheckIn[]`):
```prisma
  MealPlanCheckIn    MealPlanCheckIn[]
  Program            Program?
```

Add two new models (after the `MealPlanCheckIn` model, at the end of the file):
```prisma
/// an active multi-week transformation program (workout template + nutrition guidance + weekly checklists)
model Program {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile      Profile  @relation(fields: [profileId], references: [id])
  profileId    String   @unique @db.Uuid
  title        String
  subtitle     String?
  totalWeeks   Int
  startWeight  Float?
  targetWeight Float?
  startDate    DateTime @default(now()) @db.Date
  rules        Json
  mealPlan     Json
  createdAt    DateTime @default(now())

  weeks ProgramWeek[]

  @@map("programs")
}

/// one week's schedule/checklist within a Program
model ProgramWeek {
  id               String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  program          Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  programId        String  @db.Uuid
  weekIndex        Int
  title            String
  subtitle         String?
  socialActivity   String?
  soloActivity     String?
  checklist        Json
  milestoneAwarded Boolean @default(false)

  @@unique([programId, weekIndex])
  @@map("program_weeks")
}
```

- [ ] **Step 2: Push the schema**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Create RLS policies**

Using `mcp__supabase__execute_sql`:
```sql
alter table programs enable row level security;

create policy "programs_owner_access" on programs
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = programs."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = programs."profileId"
        and profiles."userId" = auth.uid()
    )
  );

alter table program_weeks enable row level security;

create policy "program_weeks_owner_access" on program_weeks
  for all
  using (
    exists (
      select 1 from programs
      join profiles on profiles.id = programs."profileId"
      where programs.id = program_weeks."programId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from programs
      join profiles on profiles.id = programs."profileId"
      where programs.id = program_weeks."programId"
        and profiles."userId" = auth.uid()
    )
  );
```

- [ ] **Step 4: Mirror into `supabase/rls.sql`**

Append to `supabase/rls.sql` (after the `ai_model_settings` or last section — append at end of file):
```sql

-- programs / program_weeks ------------------------------------------------
-- programs is owned directly via profileId (same shape as the owner-loop
-- tables). program_weeks has no profileId of its own — ownership is via
-- its parent program row, so it gets a bespoke join-based policy instead
-- of joining the generic do-loop.
alter table programs enable row level security;

create policy "programs_owner_access" on programs
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = programs."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = programs."profileId"
        and profiles."userId" = auth.uid()
    )
  );

alter table program_weeks enable row level security;

create policy "program_weeks_owner_access" on program_weeks
  for all
  using (
    exists (
      select 1 from programs
      join profiles on profiles.id = programs."profileId"
      where programs.id = program_weeks."programId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from programs
      join profiles on profiles.id = programs."profileId"
      where programs.id = program_weeks."programId"
        and profiles."userId" = auth.uid()
    )
  );
```

- [ ] **Step 5: Verify**

Using `mcp__supabase__execute_sql`:
```sql
select policyname from pg_policies where tablename in ('programs', 'program_weeks');
```
Expected: two rows, `programs_owner_access` and `program_weeks_owner_access`.

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add Program and ProgramWeek schema with owner-scoped RLS"
```

---

### Task 2: AI ingestion (`lib/ai/program.ts` + API route)

**Files:**
- Create: `lib/ai/program.ts`
- Create: `app/api/ai/program/route.ts`

**Interfaces:**
- Produces: `generateProgram(profile: { age: number; weight: number; height: number; activityLevel: string }, pastedPlanText: string, model: string): Promise<GeneratedProgram>` where:
  ```ts
  type GeneratedProgram = {
    title: string;
    subtitle: string;
    totalWeeks: number;
    startWeight: number | null;
    targetWeight: number | null;
    rules: string[];
    weekdayTemplate: { dayOfWeek: number; bodyPart: BodyPart }[]; // 7 entries
    mealPlan: { meal1: string[]; meal2: string[]; eveningShake: string[]; snacks: string[]; flexMealNote: string };
    weeks: { weekIndex: number; title: string; subtitle: string; socialActivity: string; soloActivity: string; checklist: string[] }[];
  };
  ```
- Consumes: `BODY_PARTS`, `type BodyPart` from `@/lib/ai/types` (existing). `getModel` from `@/lib/ai/modelConfig` (existing). `formatAiError` from `@/lib/ai/errors` (existing).

- [ ] **Step 1: Write `lib/ai/program.ts`**

```ts
// lib/ai/program.ts
import OpenAI from 'openai';
import { BODY_PARTS, type BodyPart } from './types';

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

export type GeneratedProgramWeek = {
  weekIndex: number;
  title: string;
  subtitle: string;
  socialActivity: string;
  soloActivity: string;
  checklist: string[];
};

export type GeneratedProgram = {
  title: string;
  subtitle: string;
  totalWeeks: number;
  startWeight: number | null;
  targetWeight: number | null;
  rules: string[];
  weekdayTemplate: { dayOfWeek: number; bodyPart: BodyPart }[];
  mealPlan: {
    meal1: string[];
    meal2: string[];
    eveningShake: string[];
    snacks: string[];
    flexMealNote: string;
  };
  weeks: GeneratedProgramWeek[];
};

function buildPrompt(profile: ProfileContext, pastedPlanText: string): string {
  return `You are structuring a user's freeform multi-week fitness/nutrition transformation plan into a strict JSON schema for an app to persist and track.

User profile (for context only, don't override anything explicit in their pasted plan):
- Age: ${profile.age}
- Weight: ${profile.weight} kg
- Height: ${profile.height} cm
- Activity level: ${profile.activityLevel}

The user's pasted plan:
"""
${pastedPlanText}
"""

Extract and structure this into a JSON object with this exact shape:
{
  "title": "string, a short catchy name for the program (invent one if the plan doesn't have a title)",
  "subtitle": "string, one sentence describing the plan's approach",
  "totalWeeks": number (the plan's duration in weeks; infer from content if not explicit),
  "startWeight": number or null (starting weight in kg if mentioned, else null),
  "targetWeight": number or null (target weight in kg if mentioned, else null),
  "rules": ["string", ...] (the plan's daily/ongoing rules or habits to maintain — short, imperative phrasing),
  "weekdayTemplate": [{"dayOfWeek": 0-6, "bodyPart": one of ${BODY_PARTS.join(', ')}}, ... exactly 7 entries, one per day 0=Sunday..6=Saturday, covering every day exactly once] (the plan's recurring weekly workout schedule; use "Rest" for rest/recovery days),
  "mealPlan": {
    "meal1": ["string", ...] (first-meal-of-the-day options/guidance),
    "meal2": ["string", ...] (main-meal-of-the-day options/guidance),
    "eveningShake": ["string", ...] (evening snack/shake guidance, empty array if not applicable),
    "snacks": ["string", ...] (between-meal snack options),
    "flexMealNote": "string, guidance on the plan's flexible/cheat meal allowance, empty string if not applicable"
  },
  "weeks": [
    {
      "weekIndex": number (1-based, 1 through totalWeeks, every value exactly once),
      "title": "string, this week's short theme/title",
      "subtitle": "string, one short phrase describing this week's difficulty/focus",
      "socialActivity": "string, a weekend/social activity suggestion for this week (empty string if the plan doesn't distinguish social vs solo)",
      "soloActivity": "string, a weekend/solo activity suggestion for this week (empty string if not applicable)",
      "checklist": ["string", ...] (this week's specific checklist items to complete, e.g. "Mon-Fri workouts done", "Weigh-in logged")
    }
    ... one entry for every week 1 through totalWeeks
  ]
}

Respond with ONLY the JSON object, no other text, no markdown code fences.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function validateProgramPlan(raw: unknown): GeneratedProgram {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.title !== 'string' || typeof r.subtitle !== 'string') {
    throw new Error('AI response missing title/subtitle');
  }
  if (typeof r.totalWeeks !== 'number' || r.totalWeeks < 1 || r.totalWeeks > 52) {
    throw new Error('AI response has an invalid totalWeeks');
  }
  const startWeight = typeof r.startWeight === 'number' ? r.startWeight : null;
  const targetWeight = typeof r.targetWeight === 'number' ? r.targetWeight : null;

  if (!isStringArray(r.rules)) {
    throw new Error('AI response has an invalid rules array');
  }

  if (!Array.isArray(r.weekdayTemplate) || r.weekdayTemplate.length !== 7) {
    throw new Error('AI response weekdayTemplate must have exactly 7 entries');
  }
  const seenDays = new Set<number>();
  const weekdayTemplate = (r.weekdayTemplate as unknown[]).map((entry) => {
    const dayOfWeek = (entry as { dayOfWeek?: unknown } | null)?.dayOfWeek;
    const bodyPart = (entry as { bodyPart?: unknown } | null)?.bodyPart;
    if (
      typeof dayOfWeek !== 'number' ||
      typeof bodyPart !== 'string' ||
      !(BODY_PARTS as readonly string[]).includes(bodyPart)
    ) {
      throw new Error('AI response has a malformed weekdayTemplate entry');
    }
    if (dayOfWeek < 0 || dayOfWeek > 6 || seenDays.has(dayOfWeek)) {
      throw new Error(`AI response has an invalid or duplicate dayOfWeek: ${dayOfWeek}`);
    }
    seenDays.add(dayOfWeek);
    return { dayOfWeek, bodyPart: bodyPart as BodyPart };
  });
  if (seenDays.size !== 7) {
    throw new Error('AI response weekdayTemplate does not cover all 7 days');
  }
  weekdayTemplate.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const mealPlanRaw = r.mealPlan as Record<string, unknown> | undefined;
  if (
    !mealPlanRaw ||
    !isStringArray(mealPlanRaw.meal1) ||
    !isStringArray(mealPlanRaw.meal2) ||
    !isStringArray(mealPlanRaw.eveningShake) ||
    !isStringArray(mealPlanRaw.snacks) ||
    typeof mealPlanRaw.flexMealNote !== 'string'
  ) {
    throw new Error('AI response has an invalid mealPlan');
  }
  const mealPlan = {
    meal1: mealPlanRaw.meal1 as string[],
    meal2: mealPlanRaw.meal2 as string[],
    eveningShake: mealPlanRaw.eveningShake as string[],
    snacks: mealPlanRaw.snacks as string[],
    flexMealNote: mealPlanRaw.flexMealNote as string,
  };

  if (!Array.isArray(r.weeks) || r.weeks.length !== r.totalWeeks) {
    throw new Error(`AI response has ${Array.isArray(r.weeks) ? r.weeks.length : 0} weeks, expected ${r.totalWeeks}`);
  }
  const seenWeekIndices = new Set<number>();
  const weeks: GeneratedProgramWeek[] = (r.weeks as unknown[]).map((entry) => {
    const w = entry as Record<string, unknown>;
    if (
      typeof w.weekIndex !== 'number' ||
      typeof w.title !== 'string' ||
      typeof w.subtitle !== 'string' ||
      typeof w.socialActivity !== 'string' ||
      typeof w.soloActivity !== 'string' ||
      !isStringArray(w.checklist) ||
      (w.checklist as string[]).length === 0
    ) {
      throw new Error('AI response has a malformed week entry');
    }
    if (w.weekIndex < 1 || w.weekIndex > (r.totalWeeks as number) || seenWeekIndices.has(w.weekIndex)) {
      throw new Error(`AI response has an invalid or duplicate weekIndex: ${w.weekIndex}`);
    }
    seenWeekIndices.add(w.weekIndex);
    return {
      weekIndex: w.weekIndex,
      title: w.title,
      subtitle: w.subtitle,
      socialActivity: w.socialActivity,
      soloActivity: w.soloActivity,
      checklist: w.checklist as string[],
    };
  });
  if (seenWeekIndices.size !== (r.totalWeeks as number)) {
    throw new Error('AI response weeks do not cover every weekIndex from 1 to totalWeeks');
  }
  weeks.sort((a, b) => a.weekIndex - b.weekIndex);

  return {
    title: r.title,
    subtitle: r.subtitle,
    totalWeeks: r.totalWeeks,
    startWeight,
    targetWeight,
    rules: r.rules as string[],
    weekdayTemplate,
    mealPlan,
    weeks,
  };
}

export async function generateProgram(
  profile: ProfileContext,
  pastedPlanText: string,
  model: string
): Promise<GeneratedProgram> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [{ role: 'user', content: buildPrompt(profile, pastedPlanText) }],
    response_format: { type: 'json_object' },
  });

  if (!completion.choices || completion.choices.length === 0) {
    const providerError = (completion as unknown as { error?: { message?: string } }).error;
    throw new Error(providerError?.message || 'AI provider returned no response choices');
  }

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

  return validateProgramPlan(parsed);
}
```

- [ ] **Step 2: Write the API route**

```ts
// app/api/ai/program/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateProgram } from '@/lib/ai/program';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

export async function POST(request: Request) {
  let model = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const pastedPlanText = typeof body?.pastedPlanText === 'string' ? body.pastedPlanText.trim() : '';
    if (!pastedPlanText || pastedPlanText.length < 20) {
      return NextResponse.json({ error: 'Please paste your plan text (at least 20 characters)' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('age, weight, height, activityLevel')
      .eq('userId', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    model = await getModel(supabase, 'text');

    try {
      const program = await generateProgram(profile, pastedPlanText, model);
      return NextResponse.json({ program });
    } catch (firstError) {
      console.error('AI program generation failed, retrying once:', firstError);
      try {
        const program = await generateProgram(profile, pastedPlanText, model);
        return NextResponse.json({ program });
      } catch (secondError) {
        console.error('AI program generation failed on retry:', secondError);
        return NextResponse.json({ error: formatAiError(model, secondError) }, { status: 502 });
      }
    }
  } catch (error) {
    console.error('Unexpected error in /api/ai/program:', error);
    return NextResponse.json({ error: formatAiError(model, error) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

This task has no UI yet — verify the route directly. With the dev server running, log in via the browser first to get a valid session cookie, then from the browser console (or `mcp__chrome-devtools__evaluate_script`) run:
```js
fetch('/api/ai/program', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pastedPlanText: 'An 8-week plan: Monday strength, Tuesday cardio, Wednesday strength, Thursday cardio, Friday strength, weekends easy hikes, Sunday rest. Eat two meals a day plus a protein shake. One flex meal per week.' }),
}).then(r => r.json()).then(console.log)
```
Expected: a JSON response with a `program` object matching the `GeneratedProgram` shape — 7 `weekdayTemplate` entries, 8 `weeks` entries (or whatever `totalWeeks` the model infers), populated `mealPlan`. If it errors, read the message — a malformed-response error here means the prompt/validation needs adjustment before proceeding to Task 3+.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/program.ts app/api/ai/program/route.ts
git commit -m "feat: add AI program-generation lib and API route"
```

---

### Task 3: `RidgeProgress` component

**Files:**
- Create: `app/(burnlog)/session/_components/RidgeProgress.tsx`

**Interfaces:**
- Produces: `RidgeProgress({ weeks, onSelectWeek }: RidgeProgressProps)` where `RidgeProgressProps = { weeks: { weekIndex: number; complete: boolean }[]; onSelectWeek?: (weekIndex: number) => void }`.

- [ ] **Step 1: Write `RidgeProgress`**

```tsx
// app/(burnlog)/session/_components/RidgeProgress.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RidgeProgressProps = {
  weeks: { weekIndex: number; complete: boolean }[];
  onSelectWeek?: (weekIndex: number) => void;
};

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 210;
const PADDING_X = 50;
const TOP_Y = 20;
const BOTTOM_Y = 175;

export function RidgeProgress({ weeks, onSelectWeek }: RidgeProgressProps) {
  const n = weeks.length;
  const completeCount = weeks.filter((w) => w.complete).length;
  const currentIndex = weeks.findIndex((w) => !w.complete);

  const peaks = weeks.map((w, i) => {
    const x = n === 1 ? VIEW_WIDTH / 2 : PADDING_X + (i * (VIEW_WIDTH - PADDING_X * 2)) / (n - 1);
    const y = n === 1 ? TOP_Y : BOTTOM_Y - (i * (BOTTOM_Y - TOP_Y)) / (n - 1);
    return { ...w, x, y };
  });

  const linePath = peaks.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Your climb</CardTitle>
        <span className="font-mono text-xs text-muted-foreground">
          {completeCount} / {n} weeks complete
        </span>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="w-full">
          <path d={linePath} fill="none" stroke="var(--border)" strokeWidth={2} />
          {peaks.map((p, i) => (
            <circle
              key={p.weekIndex}
              cx={p.x}
              cy={p.y}
              r={9}
              stroke="var(--card)"
              strokeWidth={3}
              fill={p.complete ? 'var(--primary)' : i === currentIndex ? 'var(--chart-3)' : 'var(--muted)'}
              onClick={() => onSelectWeek?.(p.weekIndex)}
              className={onSelectWeek ? 'cursor-pointer' : undefined}
            />
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

No dedicated page renders this yet — it will be visually verified once wired into `ProgramView` in Task 6. Skip a standalone check here; this step exists to confirm the file compiles in isolation.

- [ ] **Step 3: Commit**

```bash
git add app/(burnlog)/session/_components/RidgeProgress.tsx
git commit -m "feat: add RidgeProgress program progress visualization"
```

---

### Task 4: `ProgramWeekAccordion` component

**Files:**
- Create: `app/(burnlog)/session/_components/ProgramWeekAccordion.tsx`

**Interfaces:**
- Produces: `ProgramWeekAccordion({ week, onWeekUpdated, onMilestone }: ProgramWeekAccordionProps)` where:
  ```ts
  type ProgramWeekRow = {
    id: string;
    weekIndex: number;
    title: string;
    subtitle: string | null;
    socialActivity: string | null;
    soloActivity: string | null;
    checklist: { label: string; checked: boolean }[];
    milestoneAwarded: boolean;
  };
  type ProgramWeekAccordionProps = {
    week: ProgramWeekRow;
    onWeekUpdated: (week: ProgramWeekRow) => void;
    onMilestone: (weekTitle: string) => void;
  };
  ```

- [ ] **Step 1: Write `ProgramWeekAccordion`**

```tsx
// app/(burnlog)/session/_components/ProgramWeekAccordion.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProgramWeekRow = {
  id: string;
  weekIndex: number;
  title: string;
  subtitle: string | null;
  socialActivity: string | null;
  soloActivity: string | null;
  checklist: { label: string; checked: boolean }[];
  milestoneAwarded: boolean;
};

type ProgramWeekAccordionProps = {
  week: ProgramWeekRow;
  onWeekUpdated: (week: ProgramWeekRow) => void;
  onMilestone: (weekTitle: string) => void;
};

export function ProgramWeekAccordion({ week, onWeekUpdated, onMilestone }: ProgramWeekAccordionProps) {
  const supabase = createClientComponentClient();
  const [open, setOpen] = useState(false);
  const checkedCount = week.checklist.filter((item) => item.checked).length;

  const handleToggle = async (itemIndex: number, checked: boolean) => {
    const newChecklist = week.checklist.map((item, i) => (i === itemIndex ? { ...item, checked } : item));
    const allChecked = newChecklist.every((item) => item.checked);
    const justCompleted = allChecked && !week.milestoneAwarded;

    const { error } = await supabase
      .from('program_weeks')
      .update({ checklist: newChecklist, ...(justCompleted ? { milestoneAwarded: true } : {}) })
      .eq('id', week.id);

    if (!error) {
      onWeekUpdated({ ...week, checklist: newChecklist, milestoneAwarded: week.milestoneAwarded || allChecked });
      if (justCompleted) onMilestone(week.title);
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-muted font-semibold text-primary">
            W{week.weekIndex}
          </span>
          <div>
            <div className="font-semibold">{week.title}</div>
            {week.subtitle && <div className="text-xs text-muted-foreground">{week.subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {checkedCount}/{week.checklist.length}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          {(week.socialActivity || week.soloActivity) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {week.socialActivity && (
                <div className="rounded-lg border bg-[color:var(--chart-2)]/10 p-3 text-sm">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    With friends
                  </span>
                  {week.socialActivity}
                </div>
              )}
              {week.soloActivity && (
                <div className="rounded-lg border bg-[color:var(--chart-1)]/10 p-3 text-sm">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Solo
                  </span>
                  {week.soloActivity}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {week.checklist.map((item, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <Checkbox checked={item.checked} onCheckedChange={(checked) => handleToggle(i, checked === true)} />
                <span className={cn(item.checked && 'text-muted-foreground line-through')}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visually verified once wired into `ProgramView` in Task 6.

- [ ] **Step 3: Commit**

```bash
git add "app/(burnlog)/session/_components/ProgramWeekAccordion.tsx"
git commit -m "feat: add ProgramWeekAccordion with persisted checklist state"
```

---

### Task 5: `ProgramCreateFlow` component

**Files:**
- Create: `app/(burnlog)/session/_components/ProgramCreateFlow.tsx`

**Interfaces:**
- Produces: `ProgramCreateFlow({ profileId, onCreated }: { profileId: string; onCreated: () => void })`.
- Consumes: `GeneratedProgram` type from `@/lib/ai/program` (Task 2).

- [ ] **Step 1: Write `ProgramCreateFlow`**

```tsx
// app/(burnlog)/session/_components/ProgramCreateFlow.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mountain } from 'lucide-react';
import type { GeneratedProgram } from '@/lib/ai/program';

type ProgramCreateFlowProps = {
  profileId: string;
  onCreated: () => void;
};

export function ProgramCreateFlow({ profileId, onCreated }: ProgramCreateFlowProps) {
  const supabase = createClientComponentClient();
  const [pastedPlanText, setPastedPlanText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedProgram | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedPlanText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate program');
      setGenerated(data.program as GeneratedProgram);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate program');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generated) return;
    setSaving(true);
    setError(null);
    try {
      const workoutRows = generated.weekdayTemplate.map((entry) => ({
        profileId,
        dayOfWeek: entry.dayOfWeek,
        bodyPart: entry.bodyPart,
        repeatWeekly: true,
      }));
      const { error: workoutError } = await supabase
        .from('workout_plans')
        .upsert(workoutRows, { onConflict: 'profileId,dayOfWeek' });
      if (workoutError) throw workoutError;

      // Replace any existing program for this profile (cascades its weeks).
      await supabase.from('programs').delete().eq('profileId', profileId);

      const { data: programRow, error: programError } = await supabase
        .from('programs')
        .insert({
          profileId,
          title: generated.title,
          subtitle: generated.subtitle,
          totalWeeks: generated.totalWeeks,
          startWeight: generated.startWeight,
          targetWeight: generated.targetWeight,
          rules: generated.rules,
          mealPlan: generated.mealPlan,
        })
        .select('id')
        .single();
      if (programError || !programRow) throw programError || new Error('Failed to create program');

      const weekRows = generated.weeks.map((w) => ({
        programId: programRow.id,
        weekIndex: w.weekIndex,
        title: w.title,
        subtitle: w.subtitle,
        socialActivity: w.socialActivity,
        soloActivity: w.soloActivity,
        checklist: w.checklist.map((label) => ({ label, checked: false })),
      }));
      const { error: weeksError } = await supabase.from('program_weeks').insert(weekRows);
      if (weeksError) throw weeksError;

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save program');
    } finally {
      setSaving(false);
    }
  };

  if (generated) {
    return (
      <div className="space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mountain className="size-5 text-primary" />
              {generated.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{generated.subtitle}</p>
            <p>{generated.totalWeeks} weeks · {generated.weeks.length} weekly checklists generated</p>
            {generated.startWeight && generated.targetWeight && (
              <p>{generated.startWeight}kg → {generated.targetWeight}kg</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {generated.weeks.map((w) => (
            <div key={w.weekIndex} className="rounded-lg border p-3 text-sm">
              <span className="font-medium">Week {w.weekIndex}: {w.title}</span>
              <p className="text-xs text-muted-foreground">{w.checklist.join(' · ')}</p>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGenerated(null)} disabled={saving}>
            Regenerate
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save Program'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mountain className="size-5 text-primary" />
            Start a Program
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste a multi-week transformation plan (from an AI chat, a coach, or your own notes) and it'll be
            structured into a trackable program with weekly checklists.
          </p>
          <Textarea
            value={pastedPlanText}
            onChange={(e) => setPastedPlanText(e.target.value)}
            placeholder="Paste your plan here..."
            rows={8}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleGenerate} disabled={generating || pastedPlanText.trim().length < 20}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : 'Generate Program'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Confirm `Textarea` exists**

Run: `ls components/ui/textarea.tsx`
Expected: file exists (shadcn's standard `Textarea` component). If it does not exist, run `npx shadcn@latest add textarea` (or check `components/ui/` for an equivalent multi-line input component and use that instead — do not hand-roll a new one).

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visually verified end-to-end once wired into `ProgramView`/the Plan page in Task 7 — this step confirms the file compiles and the `Textarea` dependency resolves.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/session/_components/ProgramCreateFlow.tsx"
git commit -m "feat: add ProgramCreateFlow paste-to-generate UI"
```

---

### Task 6: `ProgramView` orchestrator

**Files:**
- Create: `app/(burnlog)/session/_components/ProgramView.tsx`

**Interfaces:**
- Produces: `ProgramView({ profileId }: { profileId: string })`.
- Consumes: `RidgeProgress` (Task 3), `ProgramWeekAccordion`, `type ProgramWeekRow` (Task 4), `ProgramCreateFlow` (Task 5), `computeLevel` from `@/lib/leveling` (existing), `AchievementOverlay` from `@/components/AchievementOverlay` (existing).

- [ ] **Step 1: Write `ProgramView`**

```tsx
// app/(burnlog)/session/_components/ProgramView.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { computeLevel } from '@/lib/leveling';
import { AchievementOverlay } from '@/components/AchievementOverlay';
import { RidgeProgress } from './RidgeProgress';
import { ProgramWeekAccordion, type ProgramWeekRow } from './ProgramWeekAccordion';
import { ProgramCreateFlow } from './ProgramCreateFlow';

type ProgramRow = {
  id: string;
  title: string;
  subtitle: string | null;
  totalWeeks: number;
  startWeight: number | null;
  targetWeight: number | null;
  rules: string[];
  mealPlan: { meal1: string[]; meal2: string[]; eveningShake: string[]; snacks: string[]; flexMealNote: string };
};

const PROGRAM_WEEK_BONUS_XP = 40;

export function ProgramView({ profileId }: { profileId: string }) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [weeks, setWeeks] = useState<ProgramWeekRow[]>([]);
  const [milestone, setMilestone] = useState<{ stats: string[] } | null>(null);

  const fetchProgram = useCallback(async () => {
    setLoading(true);
    const { data: programRow } = await supabase
      .from('programs')
      .select('id, title, subtitle, totalWeeks, startWeight, targetWeight, rules, mealPlan')
      .eq('profileId', profileId)
      .maybeSingle();

    if (!programRow) {
      setProgram(null);
      setWeeks([]);
      setLoading(false);
      return;
    }

    setProgram(programRow as ProgramRow);

    const { data: weekRows } = await supabase
      .from('program_weeks')
      .select('id, weekIndex, title, subtitle, socialActivity, soloActivity, checklist, milestoneAwarded')
      .eq('programId', programRow.id)
      .order('weekIndex', { ascending: true });

    setWeeks((weekRows ?? []) as ProgramWeekRow[]);
    setLoading(false);
  }, [supabase, profileId]);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  const handleWeekUpdated = (updated: ProgramWeekRow) => {
    setWeeks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const handleMilestone = async (weekTitle: string) => {
    const { data: profileRow } = await supabase.from('profiles').select('xp, level').eq('id', profileId).single();
    if (!profileRow) return;

    const newXp = profileRow.xp + PROGRAM_WEEK_BONUS_XP;
    const newLevel = computeLevel(newXp);
    const { error } = await supabase.from('profiles').update({ xp: newXp, level: newLevel }).eq('id', profileId);

    if (!error) {
      const stats = [`+${PROGRAM_WEEK_BONUS_XP} XP`, `🏔️ ${weekTitle} complete!`];
      if (newLevel > profileRow.level) stats.push(`⭐ Level ${newLevel}!`);
      setMilestone({ stats });
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!program) {
    return <ProgramCreateFlow profileId={profileId} onCreated={fetchProgram} />;
  }

  const ridgeWeeks = weeks.map((w) => ({
    weekIndex: w.weekIndex,
    complete: w.checklist.length > 0 && w.checklist.every((item) => item.checked),
  }));

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{program.title}</CardTitle>
          {program.subtitle && <p className="text-sm text-muted-foreground">{program.subtitle}</p>}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          {program.startWeight && (
            <div>
              <div className="font-semibold">{program.startWeight}kg</div>
              <div className="text-xs text-muted-foreground">Start</div>
            </div>
          )}
          {program.targetWeight && (
            <div>
              <div className="font-semibold">{program.targetWeight}kg</div>
              <div className="text-xs text-muted-foreground">Target</div>
            </div>
          )}
          <div>
            <div className="font-semibold">{program.totalWeeks}</div>
            <div className="text-xs text-muted-foreground">Weeks</div>
          </div>
        </CardContent>
      </Card>

      <RidgeProgress weeks={ridgeWeeks} />

      {program.rules.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">The Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {program.rules.map((rule, i) => (
                <li key={i} className="rounded-lg border px-3 py-2 text-sm">
                  {rule}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nutrition Guidance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ['Meal 1', program.mealPlan.meal1],
              ['Meal 2', program.mealPlan.meal2],
              ['Evening Shake', program.mealPlan.eveningShake],
              ['Snacks', program.mealPlan.snacks],
            ] as const
          )
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="mb-1 text-sm font-medium text-primary">{label}</div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          {program.mealPlan.flexMealNote && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:col-span-2">
              <div className="mb-1 text-sm font-medium text-primary">Flex Meal</div>
              <p className="text-xs text-muted-foreground">{program.mealPlan.flexMealNote}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {weeks.map((week) => (
          <ProgramWeekAccordion
            key={week.id}
            week={week}
            onWeekUpdated={handleWeekUpdated}
            onMilestone={handleMilestone}
          />
        ))}
      </div>

      <AchievementOverlay
        open={!!milestone}
        title="Week Complete!"
        message="Every item checked off — that's how the whole program gets finished."
        stats={milestone?.stats ?? []}
        celebrate
        autoCloseMs={4000}
        onClose={() => setMilestone(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Full end-to-end verification happens in Task 7 once this is reachable from the Plan page.

- [ ] **Step 3: Commit**

```bash
git add "app/(burnlog)/session/_components/ProgramView.tsx"
git commit -m "feat: add ProgramView orchestrator (header, ridge, rules, meals, weeks)"
```

---

### Task 7: Wire the Program tab into the Plan page

**Files:**
- Modify: `components/kokonutui/plan-view-toggle.tsx`
- Modify: `app/(burnlog)/session/page.tsx`

**Interfaces:**
- Consumes: `ProgramView` from `./_components/ProgramView` (Task 6).

- [ ] **Step 1: Add the third tab to `PlanViewToggle`**

Replace the full contents of `components/kokonutui/plan-view-toggle.tsx`:
```tsx
// components/kokonutui/plan-view-toggle.tsx
'use client';

import { CalendarDays, CalendarRange, Mountain } from 'lucide-react';
import { SmoothTabs, type TabItem } from './smooth-tabs';

const PLAN_VIEW_TABS: TabItem[] = [
  { id: 'day', icon: CalendarDays, label: 'Day view', color: 'var(--chart-1)' },
  { id: 'month', icon: CalendarRange, label: 'Month view', color: 'var(--chart-2)' },
  { id: 'program', icon: Mountain, label: 'Program view', color: 'var(--chart-3)' },
];

type PlanView = 'day' | 'month' | 'program';

type PlanViewToggleProps = {
  view: PlanView;
  onChange: (view: PlanView) => void;
};

const INDEX_TO_VIEW: PlanView[] = ['day', 'month', 'program'];

export function PlanViewToggle({ view, onChange }: PlanViewToggleProps) {
  const selectedIndex = INDEX_TO_VIEW.indexOf(view);
  return (
    <SmoothTabs
      items={PLAN_VIEW_TABS}
      selectedIndex={selectedIndex}
      onSelect={(index) => onChange(INDEX_TO_VIEW[index])}
    />
  );
}
```

- [ ] **Step 2: Wire it into the Plan page**

In `app/(burnlog)/session/page.tsx`, add the import (after the `DailyRingsWidget` import):
```tsx
import { ProgramView } from './_components/ProgramView';
```

Change the `view` state type — find:
```tsx
  const [view, setView] = useState<'day' | 'month'>('day');
```
replace with:
```tsx
  const [view, setView] = useState<'day' | 'month' | 'program'>('day');
```

Add the Program branch — find:
```tsx
      {view === 'month' ? (
        profileId && (
          <PlanMonthCalendar
            profileId={profileId}
            currentStreak={currentStreak}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setDay(date.getDay());
              setView('day');
            }}
          />
        )
      ) : (
```
replace with:
```tsx
      {view === 'program' ? (
        profileId && <ProgramView profileId={profileId} />
      ) : view === 'month' ? (
        profileId && (
          <PlanMonthCalendar
            profileId={profileId}
            currentStreak={currentStreak}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setDay(date.getDay());
              setView('day');
            }}
          />
        )
      ) : (
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `/session`, confirm the toggle now shows three tabs (Day/Month/Program). Tap "Program" — if no program exists yet, confirm `ProgramCreateFlow`'s paste box renders. Paste a real multi-week plan (e.g. the exact "Ridge Line" plan text this feature was built from), tap "Generate Program", confirm a review summary renders with the correct title/weeks/rules. Tap "Save Program", confirm the view switches to the full `ProgramView`: header stats, ridge visualization (peaks equal to the week count, first one highlighted as "current"), Rules card, Nutrition Guidance card (sections + flex-meal callout), and the week accordions (collapsed by default). Expand a week, check off every checklist item, confirm the `AchievementOverlay` celebration fires with `+40 XP` and the ridge's corresponding peak turns "done" while the next week becomes "current". Reload and confirm all state (checked items, program data) persisted. Switch to Day view and confirm the weekday schedule now reflects the generated `weekdayTemplate` (via the existing `workout_plans` read this page already does). Check both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add components/kokonutui/plan-view-toggle.tsx "app/(burnlog)/session/page.tsx"
git commit -m "feat: add Program tab to the Plan page"
```
