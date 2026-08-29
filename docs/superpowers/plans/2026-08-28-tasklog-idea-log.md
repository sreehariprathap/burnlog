# TaskLog Idea Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Idea Log to TaskLog's Plan page — a tab for capturing ideas (title + category), with an AI "Generate plan" action that turns an idea into a written plan plus a reviewable, editable list of tasks that get inserted into the existing Plan inbox.

**Architecture:** New `Idea` Prisma model (table `tasklog_ideas`) parallel to the existing `TaskGoal` model, with `Task` gaining a nullable `ideaId` FK parallel to its existing `goalId`. A new tab on `app/(tasklog)/tasklog/plan/page.tsx` (using the existing `components/ui/tabs.tsx`) hosts idea capture + list, reusing the existing SWR + `createClientComponentClient()` data-fetching pattern. A new AI route `app/api/ai/tasklog/idea-breakdown/route.ts` mirrors `app/api/ai/tasklog/breakdown/route.ts` exactly but returns `{ plan, tasks[] }` instead of just `{ tasks[] }`, and a new `IdeaBreakdownReviewSheet.tsx` mirrors `BreakdownReviewSheet.tsx` with an added read-only plan-text block.

**Tech Stack:** Next.js 15.3.8 App Router, React 19, Supabase (`@supabase/supabase-js` + `@supabase/auth-helpers-nextjs`), Prisma (schema-only, `db push` not migrations), SWR, Tailwind + shadcn/Radix `components/ui`, OpenRouter via `openai` SDK (`lib/ai/openrouter.ts` / `lib/ai/modelConfig.ts`).

**Spec:** `docs/superpowers/specs/2026-08-28-tasklog-idea-log-design.md`

## Global Constraints

- Categories are a fixed enum: `'idea' | 'startup' | 'business' | 'money' | 'other'` — no free-form input.
- Idea Log is a tab on `/tasklog/plan`, not a new route.
- Tasks created from a breakdown get `ideaId` set and `lane = null` (land in Plan, Tasks tab).
- Schema changes go through `npx prisma db push` + `npx prisma generate` (this repo has no migrations directory).
- RLS: `tasklog_ideas` must be added to the existing owner-access loop in `supabase/rls.sql` before the feature is usable end-to-end (client uses the anon key only).
- No dedup/removal logic when re-running "Generate plan" on an idea that already has tasks — out of scope.

---

### Task 1: Prisma schema — `Idea` model + `Task.ideaId`

**Files:**
- Modify: `prisma/schema.prisma` (add `Idea` model after `TaskGoal`/`Task`, around line 449; add `ideaId`/`idea` fields to `Task`)

**Interfaces:**
- Produces: Prisma model `Idea` mapped to table `tasklog_ideas` with fields `id, profileId, title, notes, category, plan, status, createdAt, tasks`. `Task` gains `ideaId: String? @db.Uuid` and `idea: Idea? @relation(...)`.

- [ ] **Step 1: Add the `Idea` model and `Task.ideaId` relation to the schema**

In `prisma/schema.prisma`, immediately after the closing `}` of the `Task` model (the one mapped to `"tasklog_tasks"`), add:

```prisma
/// a raw idea captured before it's broken into tasks
model Idea {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id])
  profileId   String    @db.Uuid
  title       String
  notes       String?
  category    String // 'idea' | 'startup' | 'business' | 'money' | 'other'
  plan        String? // AI-generated written summary, set after a breakdown is confirmed
  status      String    @default("open") // 'open' | 'planned' | 'archived'
  createdAt   DateTime  @default(now())
  tasks       Task[]

  @@map("tasklog_ideas")
}
```

Then inside the existing `Task` model, immediately below the `goalId String? @db.Uuid` line, add:

```prisma
  idea            Idea?     @relation(fields: [ideaId], references: [id])
  ideaId          String?   @db.Uuid
```

Also find the `Profile` model and add `ideas Idea[]` to its list of relation fields (next to the existing `tasks Task[]` / `taskGoals TaskGoal[]`-style relation lines — match whatever the existing TaskGoal/Task back-relation lines on `Profile` are named).

- [ ] **Step 2: Push schema and regenerate client**

Run:
```bash
npx prisma db push
npx prisma generate
```
Expected: command completes without error; output confirms `tasklog_ideas` table created and `ideaId` column added to `tasklog_tasks`.

- [ ] **Step 3: Verify the generated client has the new model**

Run:
```bash
grep -n "Idea" node_modules/.prisma/client/index.d.ts | head -5
```
Expected: matches referencing `Idea`, `IdeaCreateInput`, etc.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(tasklog): add Idea model and Task.ideaId relation"
```

---

### Task 2: RLS policy for `tasklog_ideas`

**Files:**
- Modify: `supabase/rls.sql:61-63` (the `array[...]` list inside the owner-access `do $$` loop)

**Interfaces:**
- Consumes: existing owner-access loop pattern at `supabase/rls.sql:43-85`.
- Produces: RLS enabled + owner-only policy on `tasklog_ideas`, same shape as `tasklog_tasks`.

- [ ] **Step 1: Add `tasklog_ideas` to the owner-access array**

In `supabase/rls.sql`, find:
```sql
    'task_goals',
    'tasklog_tasks'
  ]
```
Replace with:
```sql
    'task_goals',
    'tasklog_tasks',
    'tasklog_ideas'
  ]
```

- [ ] **Step 2: Run the updated SQL in the Supabase SQL editor**

Copy the full contents of `supabase/rls.sql` and run it in the Supabase project's SQL editor (this file is idempotent — `alter table ... enable row level security` and `create policy` are safe to rerun since each table name in the loop is processed independently; if a policy already exists for `tasklog_ideas` this is a no-op re-run for the other tables). Confirm no errors in the SQL editor output.

- [ ] **Step 3: Verify RLS is enabled**

Run this query in the Supabase SQL editor:
```sql
select relrowsecurity from pg_class where relname = 'tasklog_ideas';
```
Expected: returns `t` (true).

- [ ] **Step 4: Commit**

```bash
git add supabase/rls.sql
git commit -m "feat(tasklog): enable RLS on tasklog_ideas"
```

---

### Task 3: Idea types in `lib/tasklog/types.ts`

**Files:**
- Modify: `lib/tasklog/types.ts`

**Interfaces:**
- Produces: `IdeaCategory` type, `IdeaRow` interface, `IDEA_CATEGORIES` constant (array of `{ id: IdeaCategory; label: string }`), consumed by Tasks 4, 5, 6, 7.

- [ ] **Step 1: Add the new types**

Append to `lib/tasklog/types.ts` (after the existing `TaskGoalRow` interface, before `LaneMeta`):

```typescript
export type IdeaCategory = 'idea' | 'startup' | 'business' | 'money' | 'other';
export type IdeaStatus = 'open' | 'planned' | 'archived';

export interface IdeaRow {
  id: string;
  profileId: string;
  title: string;
  notes: string | null;
  category: IdeaCategory;
  plan: string | null;
  status: IdeaStatus;
  createdAt: string;
}

export interface IdeaCategoryMeta {
  id: IdeaCategory;
  label: string;
}

export const IDEA_CATEGORIES: IdeaCategoryMeta[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'startup', label: 'Startup' },
  { id: 'business', label: 'Business' },
  { id: 'money', label: 'Money' },
  { id: 'other', label: 'Other' },
];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors referencing `lib/tasklog/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/tasklog/types.ts
git commit -m "feat(tasklog): add Idea types and category list"
```

---

### Task 4: `AddIdeaForm` component

**Files:**
- Create: `app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx`

**Interfaces:**
- Consumes: `IdeaCategory`, `IdeaRow`, `IDEA_CATEGORIES` from `lib/tasklog/types.ts` (Task 3); `createClientComponentClient` from `@supabase/auth-helpers-nextjs`; UI primitives `Card/CardHeader/CardTitle/CardContent`, `Button`, `Input`, `Label`, `Select/SelectContent/SelectItem/SelectTrigger/SelectValue` from `components/ui`.
- Produces: `AddIdeaForm` component with props `{ profileId: string; onIdeaAdded: (idea: IdeaRow) => void }`, consumed by Task 6 (Plan page Ideas tab).

- [ ] **Step 1: Write the component**

Model directly on `app/(tasklog)/tasklog/goals/_components/AddGoalForm.tsx`, swapping goal fields for idea fields (title + category only — no description field, per spec):

```typescript
// app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IDEA_CATEGORIES, type IdeaCategory, type IdeaRow } from '@/lib/tasklog/types';

interface AddIdeaFormProps {
  profileId: string;
  onIdeaAdded: (idea: IdeaRow) => void;
}

export function AddIdeaForm({ profileId, onIdeaAdded }: AddIdeaFormProps) {
  const supabase = createClientComponentClient();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('idea');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter an idea title');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from('tasklog_ideas')
        .insert([{ profileId, title: title.trim(), category }])
        .select()
        .single();
      if (insertError) throw insertError;
      onIdeaAdded(data as IdeaRow);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add idea');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture an idea</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Subscription box for plant care" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as IdeaCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {IDEA_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add idea'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors referencing `AddIdeaForm.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx"
git commit -m "feat(tasklog): add AddIdeaForm component"
```

---

### Task 5: `IdeaCard` component

**Files:**
- Create: `app/(tasklog)/tasklog/plan/_components/IdeaCard.tsx`

**Interfaces:**
- Consumes: `IdeaRow`, `IDEA_CATEGORIES` from `lib/tasklog/types.ts` (Task 3); `Card/CardContent`, `Button` from `components/ui`.
- Produces: `IdeaCard` component with props `{ idea: IdeaRow; taskCount: number; onGeneratePlan: (idea: IdeaRow) => void; onDelete: (ideaId: string) => void }`, consumed by Task 6.

- [ ] **Step 1: Write the component**

```typescript
// app/(tasklog)/tasklog/plan/_components/IdeaCard.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IDEA_CATEGORIES, type IdeaRow } from '@/lib/tasklog/types';

interface IdeaCardProps {
  idea: IdeaRow;
  taskCount: number;
  onGeneratePlan: (idea: IdeaRow) => void;
  onDelete: (ideaId: string) => void;
}

export function IdeaCard({ idea, taskCount, onGeneratePlan, onDelete }: IdeaCardProps) {
  const categoryLabel = IDEA_CATEGORIES.find((c) => c.id === idea.category)?.label ?? idea.category;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{idea.title}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{categoryLabel}</span>
        </div>
        {idea.plan && (
          <p className="text-xs text-muted-foreground">
            Planned · {taskCount} task{taskCount === 1 ? '' : 's'}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => onGeneratePlan(idea)}>
            {idea.plan ? 'Regenerate plan' : 'Generate plan'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(idea.id)}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors referencing `IdeaCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(tasklog)/tasklog/plan/_components/IdeaCard.tsx"
git commit -m "feat(tasklog): add IdeaCard component"
```

---

### Task 6: Ideas tab wiring on the Plan page

**Files:**
- Modify: `app/(tasklog)/tasklog/plan/page.tsx`

**Interfaces:**
- Consumes: `AddIdeaForm` (Task 4), `IdeaCard` (Task 5), `IdeaRow`/`TaskRow` (Task 3), `Tabs/TabsList/TabsTrigger/TabsContent` from `components/ui/tabs.tsx`.
- Produces: Ideas tab with capture form + list, no AI call yet (Task 8 adds "Generate plan" wiring). Existing Tasks tab content (current inbox list) is unchanged, just moved inside a `TabsContent`.

- [ ] **Step 1: Wrap existing content in tabs and add the Ideas tab**

In `app/(tasklog)/tasklog/plan/page.tsx`, add imports:

```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { IdeaRow, TaskRow } from '@/lib/tasklog/types';
import { AddIdeaForm } from './_components/AddIdeaForm';
import { IdeaCard } from './_components/IdeaCard';
```

(Remove the existing `import { LANES, PRIORITIES, type TaskLane, type TaskRow } from '@/lib/tasklog/types';` line and replace it with:
```typescript
import { LANES, PRIORITIES, type TaskLane, type TaskRow } from '@/lib/tasklog/types';
```
kept as-is — just add the `IdeaRow` import above alongside it, don't duplicate `TaskRow`.)

Add an ideas SWR fetch inside `PlanPage`, right after the existing `inboxData` SWR block:

```typescript
  const {
    data: ideaData,
    isLoading: ideasLoading,
    mutate: mutateIdeas,
  } = useSWR(profile ? ['tasklog-ideas', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_ideas')
      .select('*')
      .eq('profileId', profile!.id)
      .order('createdAt', { ascending: false });
    return (data as IdeaRow[]) || [];
  });

  const ideas = ideaData ?? [];

  const {
    data: ideaTaskData,
  } = useSWR(profile ? ['tasklog-idea-task-counts', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('ideaId')
      .eq('profileId', profile!.id)
      .not('ideaId', 'is', null);
    return (data as { ideaId: string }[]) || [];
  });

  const ideaTaskCounts = new Map<string, number>();
  for (const row of ideaTaskData ?? []) {
    ideaTaskCounts.set(row.ideaId, (ideaTaskCounts.get(row.ideaId) ?? 0) + 1);
  }

  async function handleIdeaAdded(idea: IdeaRow) {
    await mutateIdeas([idea, ...ideas], { revalidate: false });
  }

  async function handleDeleteIdea(ideaId: string) {
    await supabase.from('tasklog_ideas').delete().eq('id', ideaId);
    await mutateIdeas(ideas.filter((i) => i.id !== ideaId), { revalidate: false });
  }

  function handleGeneratePlan(idea: IdeaRow) {
    // Wired up in Task 8 — opens the breakdown review sheet.
  }
```

Now replace the page's returned JSX. The current structure is:
```tsx
  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <form onSubmit={handleQuickAdd} ...>...</form>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {isLoading ? ... : inboxTasks.map(...)}
      </div>
      <TaskLogBottomNav />
    </div>
  );
```

Change it to:
```tsx
  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <Tabs defaultValue="tasks" className="px-4 pt-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="flex flex-col gap-3 pt-3">
          <form onSubmit={handleQuickAdd} className="flex gap-2">
            <Input
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              placeholder='Dump a task… e.g. "call mom tomorrow high priority"'
              disabled={parsing}
            />
            <Button type="submit" size="icon" aria-label="Add to Plan" disabled={parsing}>
              <PlusIcon className="h-4 w-4" />
            </Button>
          </form>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : inboxTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in your inbox. Dump a task above.</p>
          ) : (
            inboxTasks.map((task) => {
              const priority = PRIORITIES.find((p) => p.id === task.priority);
              return (
                <Card key={task.id}>
                  <CardContent className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priority?.color }} />
                      <p className="text-sm font-medium">{task.title}</p>
                    </div>
                    {task.dueDate && <p className="text-xs text-muted-foreground">Due {task.dueDate}</p>}
                    <div className="flex items-center gap-2">
                      <Select onValueChange={(lane) => handleTriage(task.id, lane as TaskLane)}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Move to lane…" /></SelectTrigger>
                        <SelectContent>
                          {LANES.map((lane) => (
                            <SelectItem key={lane.id} value={lane.id}>{lane.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(task.id)}>
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="ideas" className="flex flex-col gap-3 pt-3 pb-4">
          {profile && <AddIdeaForm profileId={profile.id} onIdeaAdded={handleIdeaAdded} />}
          {ideasLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ideas yet. Capture one above.</p>
          ) : (
            ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                taskCount={ideaTaskCounts.get(idea.id) ?? 0}
                onGeneratePlan={handleGeneratePlan}
                onDelete={handleDeleteIdea}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
      <TaskLogBottomNav />
    </div>
  );
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors referencing `plan/page.tsx` (the unused `handleGeneratePlan` parameter warning, if any, is fine — it gets used in Task 8).

- [ ] **Step 3: Manual verification**

Run `npm run dev`, navigate to `/tasklog/plan`, confirm:
- Tasks tab shows existing behavior unchanged.
- Ideas tab shows the capture form; submitting adds a card to the list with the correct category badge.
- Deleting an idea removes its card.

- [ ] **Step 4: Commit**

```bash
git add "app/(tasklog)/tasklog/plan/page.tsx"
git commit -m "feat(tasklog): add Ideas tab to Plan page"
```

---

### Task 7: `idea-breakdown` AI route

**Files:**
- Create: `app/api/ai/tasklog/idea-breakdown/route.ts`

**Interfaces:**
- Consumes: `getModel` from `lib/ai/modelConfig.ts`, `formatAiError` from `lib/ai/errors.ts`, `createRouteHandlerClient` from `@supabase/auth-helpers-nextjs`.
- Produces: `POST` handler accepting `{ title: string; notes?: string | null; category: string }`, returning `{ plan: string; tasks: Array<{ title: string; category: 'life' | 'work'; priority: 'low' | 'medium' | 'high'; suggestedDueDate: string | null }> }` on success, or `{ error: string }` with a non-200 status on failure. Consumed by Task 8's `IdeaBreakdownReviewSheet`.

- [ ] **Step 1: Write the route**

Model directly on `app/api/ai/tasklog/breakdown/route.ts`, adding `plan` to both the prompt and the response parsing:

```typescript
// app/api/ai/tasklog/idea-breakdown/route.ts
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

function buildPrompt(title: string, notes: string, category: string): string {
  return `You are a productivity coach turning a raw idea into an actionable short plan.

Idea title: ${title}
Idea notes: ${notes || 'None provided'}
Idea category: ${category}

Write a short plan (2-4 sentences) describing a sensible approach to move this idea forward, then generate 4 to 8 concrete tasks that would make meaningful progress on it. Each task should be a single, specific action (not vague).

Respond with ONLY a JSON object, no markdown, in this exact shape:
{"plan": "...", "tasks": [{"title": "...", "category": "life or work", "priority": "low, medium, or high", "suggestedDueDate": "YYYY-MM-DD or null"}]}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { title, notes, category } = (await request.json()) as {
      title?: string;
      notes?: string | null;
      category?: string;
    };
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Missing idea title' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [{ role: 'user', content: buildPrompt(title, notes || '', category || 'idea') }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: {
      plan?: string;
      tasks?: Array<{ title?: string; category?: string; priority?: string; suggestedDueDate?: string | null }>;
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.plan || !parsed.tasks || parsed.tasks.length === 0) {
      return NextResponse.json({ error: 'AI response was missing a plan or tasks' }, { status: 502 });
    }

    const tasks = parsed.tasks
      .filter((t) => t.title && t.title.trim())
      .map((t) => ({
        title: t.title!.trim(),
        category: t.category === 'work' ? 'work' : 'life',
        priority: (['low', 'medium', 'high'].includes(t.priority || '') ? t.priority : 'medium') as 'low' | 'medium' | 'high',
        suggestedDueDate: t.suggestedDueDate && t.suggestedDueDate !== 'null' ? t.suggestedDueDate : null,
      }));

    return NextResponse.json({ plan: parsed.plan.trim(), tasks });
  } catch (error) {
    console.error('tasklog idea-breakdown error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors referencing `idea-breakdown/route.ts`.

- [ ] **Step 3: Manual verification**

With `npm run dev` running and an authenticated session cookie, call:
```bash
curl -X POST http://localhost:3000/api/ai/tasklog/idea-breakdown \
  -H "Content-Type: application/json" \
  -b "<your session cookie>" \
  -d '{"title":"Subscription box for plant care","category":"startup"}'
```
Expected: `200` response with a `plan` string and a non-empty `tasks` array. (If no cookie is handy, this is re-verified end-to-end in Task 8 Step 4 via the UI.)

- [ ] **Step 4: Commit**

```bash
git add "app/api/ai/tasklog/idea-breakdown/route.ts"
git commit -m "feat(tasklog): add idea-breakdown AI route"
```

---

### Task 8: `IdeaBreakdownReviewSheet` + wiring "Generate plan"

**Files:**
- Create: `app/(tasklog)/tasklog/plan/_components/IdeaBreakdownReviewSheet.tsx`
- Modify: `app/(tasklog)/tasklog/plan/page.tsx` (replace the `handleGeneratePlan` stub from Task 6, add sheet state)

**Interfaces:**
- Consumes: `Drawer/DrawerContent/DrawerHeader/DrawerTitle/DrawerFooter` from `components/ui/drawer`, `Checkbox`/`Input`/`Button` from `components/ui`, `TaskCategory`/`TaskPriority`/`IdeaRow` from `lib/tasklog/types.ts`, the `/api/ai/tasklog/idea-breakdown` route (Task 7).
- Produces: `IdeaBreakdownReviewSheet` component with props `{ open: boolean; onOpenChange: (open: boolean) => void; idea: IdeaRow | null; onConfirm: (plan: string, selected: BreakdownSuggestion[]) => Promise<void> }`, where `BreakdownSuggestion` is `{ title: string; category: TaskCategory; priority: TaskPriority; suggestedDueDate?: string | null }`.

- [ ] **Step 1: Write the review sheet**

Model directly on `app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet.tsx`, adding: (a) fetching from the idea-breakdown endpoint when opened with a new idea, (b) a read-only plan-text block, (c) `onConfirm` also receiving the plan text.

```typescript
// app/(tasklog)/tasklog/plan/_components/IdeaBreakdownReviewSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { IdeaRow, TaskCategory, TaskPriority } from '@/lib/tasklog/types';

export interface BreakdownSuggestion {
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  suggestedDueDate?: string | null;
}

interface IdeaBreakdownReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: IdeaRow | null;
  onConfirm: (plan: string, selected: BreakdownSuggestion[]) => Promise<void>;
}

export function IdeaBreakdownReviewSheet({ open, onOpenChange, idea, onConfirm }: IdeaBreakdownReviewSheetProps) {
  const [plan, setPlan] = useState('');
  const [items, setItems] = useState<(BreakdownSuggestion & { selected: boolean })[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !idea) {
      setPlan('');
      setItems([]);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/api/ai/tasklog/idea-breakdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: idea.title, notes: idea.notes, category: idea.category }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to generate plan');
        if (cancelled) return;
        setPlan(body.plan);
        setItems((body.tasks as BreakdownSuggestion[]).map((s) => ({ ...s, selected: true })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate plan');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, idea]);

  function updateTitle(index: number, title: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, title } : item)));
  }

  function toggleSelected(index: number) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)));
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const selected = items
        .filter((item) => item.selected)
        .map((item) => ({
          title: item.title,
          category: item.category,
          priority: item.priority,
          suggestedDueDate: item.suggestedDueDate,
        }));
      await onConfirm(plan, selected);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Review idea plan</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto px-4">
          {loading && <p className="text-sm text-muted-foreground">Generating plan…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && plan && <p className="rounded-md border bg-muted/50 p-3 text-sm">{plan}</p>}
          {!loading &&
            items.map((item, index) => (
              <div key={index} className="flex items-center gap-2 rounded-md border p-2">
                <Checkbox checked={item.selected} onCheckedChange={() => toggleSelected(index)} />
                <Input value={item.title} onChange={(e) => updateTitle(index, e.target.value)} className="h-8 flex-1" />
                <span className="text-xs capitalize text-muted-foreground">{item.priority}</span>
              </div>
            ))}
        </div>
        <DrawerFooter>
          <Button type="button" onClick={handleConfirm} disabled={saving || loading || items.length === 0}>
            {saving ? 'Adding…' : `Add ${selectedCount} selected`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Wire it into the Plan page**

In `app/(tasklog)/tasklog/plan/page.tsx`:

Add import:
```typescript
import { IdeaBreakdownReviewSheet, type BreakdownSuggestion } from './_components/IdeaBreakdownReviewSheet';
```

Replace the `handleGeneratePlan` stub from Task 6 and add sheet state, right after the `handleDeleteIdea` function:

```typescript
  const [breakdownIdea, setBreakdownIdea] = useState<IdeaRow | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  function handleGeneratePlan(idea: IdeaRow) {
    setBreakdownIdea(idea);
    setBreakdownOpen(true);
  }

  async function handleConfirmBreakdown(plan: string, selected: BreakdownSuggestion[]) {
    if (!breakdownIdea || !profile) return;
    const { data: updatedIdea, error: updateError } = await supabase
      .from('tasklog_ideas')
      .update({ plan })
      .eq('id', breakdownIdea.id)
      .select()
      .single();
    if (!updateError && updatedIdea) {
      await mutateIdeas(ideas.map((i) => (i.id === breakdownIdea.id ? (updatedIdea as IdeaRow) : i)), { revalidate: false });
    }
    if (selected.length > 0) {
      await supabase.from('tasklog_tasks').insert(
        selected.map((t) => ({
          profileId: profile.id,
          ideaId: breakdownIdea.id,
          title: t.title,
          category: t.category,
          priority: t.priority,
          dueDate: t.suggestedDueDate || null,
        }))
      );
      await mutateInbox();
    }
    setBreakdownOpen(false);
  }
```

Add `useState` to the existing React import at the top of the file if not already imported with that name (it already is — the file starts with `import { useState } from 'react';`).

Right before the closing `</div>` of the page's root `return`, after `<TaskLogBottomNav />`, add:

```tsx
      <IdeaBreakdownReviewSheet
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        idea={breakdownIdea}
        onConfirm={handleConfirmBreakdown}
      />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors referencing `plan/page.tsx` or `IdeaBreakdownReviewSheet.tsx`.

- [ ] **Step 4: Manual end-to-end verification**

Run `npm run dev`, navigate to `/tasklog/plan` → Ideas tab:
1. Capture an idea (e.g. title "Subscription box for plant care", category "startup").
2. Click "Generate plan" — confirm the sheet opens, shows a loading state, then shows plan text + editable task rows.
3. Deselect one task, edit another's title, click "Add N selected".
4. Confirm the idea card now shows "Planned · N tasks" with the correct count.
5. Switch to the Tasks tab, confirm the selected tasks appear in the inbox.
6. In the Supabase table editor, confirm the inserted `tasklog_tasks` rows have `ideaId` set to the idea's id, and the `tasklog_ideas` row has `plan` populated.
7. Confirm RLS: log in as a second test account, navigate to `/tasklog/plan` → Ideas tab, confirm the first account's idea is not visible.

- [ ] **Step 5: Commit**

```bash
git add "app/(tasklog)/tasklog/plan/_components/IdeaBreakdownReviewSheet.tsx" "app/(tasklog)/tasklog/plan/page.tsx"
git commit -m "feat(tasklog): wire idea breakdown review sheet into Plan page"
```

---

## Spec coverage check

- Idea capture (title + category) → Task 4, 6.
- Ideas tab on Plan page → Task 6.
- `Idea` entity distinct from `Task`, `ideaId` FK → Task 1.
- Fixed category enum → Task 3.
- AI breakdown returns plan + tasks, review sheet, confirm inserts tasks with `ideaId` set and `lane = null` → Task 7, 8.
- RLS on `tasklog_ideas` → Task 2.
- Manual/e2e testing incl. RLS cross-account check → Task 8 Step 4.
