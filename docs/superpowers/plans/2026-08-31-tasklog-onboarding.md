# TaskLog AI Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `/tasklog/onboarding` flow lets a user enter one or more goals, breaks each into AI-suggested tasks via TaskLog's existing `/api/ai/tasklog/breakdown` endpoint for review/confirm, and plugs into the sub-project 2.0 orchestrator.

**Architecture:** A `MoneyLogOnboardingFlow`-style step-state client component (`welcome` → `goals` → sequential per-goal `breakdown`+review → `done`), reusing the *existing* `BreakdownReviewSheet` component and `/api/ai/tasklog/breakdown` route verbatim rather than building new AI content.

**Tech Stack:** Next.js App Router (client components), Supabase JS client, existing `useCurrentProfile` hook, shadcn/ui, lucide-react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-31-tasklog-onboarding-design.md`

## Global Constraints

- No new AI endpoint — `POST /api/ai/tasklog/breakdown` (existing, unchanged) is called with `{ title, description, category }`.
- No schema changes — inserts go into the existing `task_goals` and `tasklog_tasks` tables with the same shapes `AddGoalForm`/`GoalCard` already use.
- `BreakdownReviewSheet` (`app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet.tsx`) is imported and used as-is, not modified or duplicated.
- The flow reads `returnTo` from `useSearchParams()` from the start (default `/tasklog`) — this is the orchestrator's contract from sub-project 2.0.
- If an AI breakdown call fails for one goal, that goal (already inserted) is kept, the review step is skipped for it with a toast, and the flow advances to the next goal rather than blocking.

---

### Task 1: Step components — Welcome, GoalEntry, Done

**Files:**
- Create: `app/(tasklog)/tasklog/onboarding/_components/WelcomeStep.tsx`
- Create: `app/(tasklog)/tasklog/onboarding/_components/GoalEntryStep.tsx`
- Create: `app/(tasklog)/tasklog/onboarding/_components/DoneStep.tsx`

**Interfaces:**
- Produces:
  - `WelcomeStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void })`
  - `GoalDraft = { title: string; description: string; category: TaskCategory }` (exported from `GoalEntryStep.tsx`)
  - `GoalEntryStep({ goals, onAdd, onRemove, onContinue }: { goals: GoalDraft[]; onAdd: (goal: GoalDraft) => void; onRemove: (index: number) => void; onContinue: () => void })`
  - `DoneStep({ goalCount, taskCount, onFinish }: { goalCount: number; taskCount: number; onFinish: () => void })`

- [ ] **Step 1: Write `WelcomeStep.tsx`**

```tsx
// app/(tasklog)/tasklog/onboarding/_components/WelcomeStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface WelcomeStepProps {
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onStart, onSkip }: WelcomeStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Let&apos;s set up TaskLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add 1–3 goals you want to make progress on — we&apos;ll break each one into concrete tasks you can start
          today. You can skip this and add goals later from the Goals tab.
        </p>
        <div className="flex gap-2">
          <Button onClick={onStart}>Get started</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `GoalEntryStep.tsx`**

```tsx
// app/(tasklog)/tasklog/onboarding/_components/GoalEntryStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import type { TaskCategory } from '@/lib/tasklog/types';

export interface GoalDraft {
  title: string;
  description: string;
  category: TaskCategory;
}

interface GoalEntryStepProps {
  goals: GoalDraft[];
  onAdd: (goal: GoalDraft) => void;
  onRemove: (index: number) => void;
  onContinue: () => void;
}

export function GoalEntryStep({ goals, onAdd, onRemove, onContinue }: GoalEntryStepProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('life');

  function handleAdd() {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), description: description.trim(), category });
    setTitle('');
    setDescription('');
    setCategory('life');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add your goals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.length > 0 && (
          <ul className="space-y-2">
            {goals.map((goal, index) => (
              <li key={index} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {goal.title} <span className="text-xs text-muted-foreground capitalize">({goal.category})</span>
                </span>
                <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${goal.title}`}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-goal-title">Goal title</Label>
            <Input
              id="onboarding-goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Get better at Spanish"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-goal-description">Description (optional)</Label>
            <Textarea
              id="onboarding-goal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-goal-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
              <SelectTrigger id="onboarding-goal-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="life">Life</SelectItem>
                <SelectItem value="work">Work</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={handleAdd} disabled={!title.trim()}>
            Add goal
          </Button>
        </div>
        <Button className="w-full" disabled={goals.length === 0} onClick={onContinue}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `DoneStep.tsx`**

```tsx
// app/(tasklog)/tasklog/onboarding/_components/DoneStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';

interface DoneStepProps {
  goalCount: number;
  taskCount: number;
  onFinish: () => void;
}

export function DoneStep({ goalCount, taskCount, onFinish }: DoneStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-amber-500" />
          You&apos;re set!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {goalCount} goal{goalCount === 1 ? '' : 's'} and {taskCount} task{taskCount === 1 ? '' : 's'} ready to go.
          Let&apos;s get moving.
        </p>
        <Button className="w-full" onClick={onFinish}>
          Go to TaskLog
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (these components have no consumers yet, so they must type-check standalone).

- [ ] **Step 5: Commit**

```bash
git add "app/(tasklog)/tasklog/onboarding/_components/WelcomeStep.tsx" "app/(tasklog)/tasklog/onboarding/_components/GoalEntryStep.tsx" "app/(tasklog)/tasklog/onboarding/_components/DoneStep.tsx"
git commit -m "feat(tasklog): add onboarding step components"
```

---

### Task 2: `TaskLogOnboardingFlow` + page

**Files:**
- Create: `app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx`
- Create: `app/(tasklog)/tasklog/onboarding/page.tsx`

**Interfaces:**
- Consumes: `WelcomeStep`, `GoalEntryStep`, `GoalDraft`, `DoneStep` (Task 1); `BreakdownReviewSheet`, `BreakdownSuggestion` from `@/app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet` (existing, unchanged); `useCurrentProfile` from `@/lib/useCurrentProfile` (existing).
- Produces: `/tasklog/onboarding` route rendering `<TaskLogOnboardingFlow />`.

- [ ] **Step 1: Write `TaskLogOnboardingFlow.tsx`**

```tsx
// app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import { WelcomeStep } from './WelcomeStep';
import { GoalEntryStep, type GoalDraft } from './GoalEntryStep';
import { DoneStep } from './DoneStep';
import {
  BreakdownReviewSheet,
  type BreakdownSuggestion,
} from '@/app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet';

type Step = 'welcome' | 'goals' | 'breakdown' | 'done';

export function TaskLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/tasklog';
  const supabase = createClientComponentClient();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('welcome');
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BreakdownSuggestion[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [goalCount, setGoalCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  async function processGoal(index: number) {
    if (index >= goalDrafts.length) {
      setStep('done');
      return;
    }
    if (!profile) return;

    const draft = goalDrafts[index];
    const { data: goal, error: insertError } = await supabase
      .from('task_goals')
      .insert([{ profileId: profile.id, title: draft.title, description: draft.description || null, category: draft.category }])
      .select()
      .single();

    if (insertError || !goal) {
      toast({ title: `Could not create goal "${draft.title}"`, description: insertError?.message, variant: 'destructive' });
      processGoal(index + 1);
      return;
    }
    setGoalCount((prev) => prev + 1);

    try {
      const res = await fetch('/api/ai/tasklog/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, description: draft.description, category: draft.category }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate tasks');
      setSuggestions(body.tasks);
      setCurrentGoalId(goal.id);
      setProcessingIndex(index);
      setReviewOpen(true);
    } catch (err) {
      toast({
        title: `Couldn't generate tasks for "${draft.title}"`,
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
      processGoal(index + 1);
    }
  }

  async function handleReviewConfirm(selected: BreakdownSuggestion[]) {
    if (selected.length > 0 && currentGoalId && profile) {
      const { error: insertError } = await supabase.from('tasklog_tasks').insert(
        selected.map((s) => ({
          profileId: profile.id,
          goalId: currentGoalId,
          title: s.title,
          category: s.category,
          priority: s.priority,
          dueDate: s.suggestedDueDate || null,
        }))
      );
      if (insertError) {
        toast({ title: 'Could not save tasks', description: insertError.message, variant: 'destructive' });
      } else {
        setTaskCount((prev) => prev + selected.length);
      }
    }
    setReviewOpen(false);
    processGoal(processingIndex + 1);
  }

  function handleStart() {
    setStep('goals');
  }

  function handleSkip() {
    router.replace(returnTo);
  }

  function handleGoalsContinue() {
    setStep('breakdown');
    processGoal(0);
  }

  function handleFinish() {
    router.replace(returnTo);
  }

  if (profileLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={handleStart} onSkip={handleSkip} />;
  }
  if (step === 'goals') {
    return (
      <GoalEntryStep
        goals={goalDrafts}
        onAdd={(goal) => setGoalDrafts((prev) => [...prev, goal])}
        onRemove={(index) => setGoalDrafts((prev) => prev.filter((_, i) => i !== index))}
        onContinue={handleGoalsContinue}
      />
    );
  }
  if (step === 'breakdown') {
    return (
      <>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm text-muted-foreground">Setting up your goals…</p>
        </div>
        <BreakdownReviewSheet
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          suggestions={suggestions}
          onConfirm={handleReviewConfirm}
        />
      </>
    );
  }
  return <DoneStep goalCount={goalCount} taskCount={taskCount} onFinish={handleFinish} />;
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
// app/(tasklog)/tasklog/onboarding/page.tsx
'use client';

import { TaskLogOnboardingFlow } from './_components/TaskLogOnboardingFlow';

export default function TaskLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <TaskLogOnboardingFlow />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no new warnings beyond the two pre-existing unrelated ones (`app/(burnlog)/goals/page.tsx`, `IdeaBreakdownReviewSheet.tsx`).

- [ ] **Step 5: Commit**

```bash
git add "app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx" "app/(tasklog)/tasklog/onboarding/page.tsx"
git commit -m "feat(tasklog): add onboarding flow at /tasklog/onboarding"
```

---

### Task 3: Orchestrator + config wiring

**Files:**
- Modify: `app/onboarding/sequence/page.tsx`
- Modify: `app/(tasklog)/tasklog/config/page.tsx`

**Interfaces:**
- No new exports — `ONBOARDING_ROUTES` gains a `tasklog` entry; `AppConfigShell`'s `onboardingHref` prop (already exists) is now passed on TaskLog's config page.

- [ ] **Step 1: Register TaskLog in the orchestrator**

In `app/onboarding/sequence/page.tsx`:

```diff
 const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
   burnlog: '/ai-setup',
   moneylog: '/moneylog/onboarding',
+  tasklog: '/tasklog/onboarding',
 };
```

- [ ] **Step 2: Add `onboardingHref` to TaskLog's config page**

In `app/(tasklog)/tasklog/config/page.tsx`:

```diff
     <AppConfigShell
       appName="TaskLog"
+      onboardingHref="/tasklog/onboarding?returnTo=/tasklog/config"
       exportData={() => ({})}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. From `/onboarding/apps`, select TaskLog alone, confirm it lands on `/tasklog/onboarding` and, after finishing or skipping, lands on `/logbook`. Select TaskLog + BurnLog together, confirm TaskLog's step is reached after BurnLog's (order follows selection order from `/onboarding/apps`). Add two goals in the goal-entry step, confirm each shows a real AI-generated task list in `BreakdownReviewSheet`, confirm both goals and their confirmed tasks appear on `/tasklog/goals` and `/tasklog/board` afterward. Visit `/tasklog/config`, click "Reonboard into TaskLog", confirm it returns to `/tasklog/config` when finished (not `/tasklog`).

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors or warnings beyond the two pre-existing unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/sequence/page.tsx "app/(tasklog)/tasklog/config/page.tsx"
git commit -m "feat(tasklog): wire onboarding into orchestrator and config Reonboard"
```

---

## Post-plan note

This plan completes sub-project 2.1 (TaskLog AI Onboarding). Next in
the initiative's decomposition: sub-project 2.2 (HomeLog AI
onboarding), then 2.3 (SocialLog), then 2.4 (ShoppingLog), each
plugging into `ONBOARDING_ROUTES` the same way this one did. Each
needs its own brainstorm → spec → plan cycle.
