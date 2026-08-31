# Logbook AI-Feature Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, linearly (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Logbook read as "AI integrated": a visible sparkle badge on Quick Add tiles that already use AI, and add AI-assisted category/priority suggestion to the Task quick-complete flow.

**Architecture:** One new API route (`app/api/ai/categorize-task/route.ts`) following the exact pattern already used by `app/api/ai/estimate-workout-calories/route.ts` (auth check → `getModel(supabase, 'text')` → single JSON-mode OpenRouter call → validated JSON response → `formatAiError` on failure). `QuickAddFab`'s `TaskForm` gains a "Suggest" button that calls it and pre-fills category/priority (still user-editable via button toggles, same UI language as the removed `ExpenseForm`'s category picker). The `OPTIONS` grid gains a per-tile `ai: boolean` flag driving a `Sparkles` badge.

**Depends on:** `docs/superpowers/plans/2026-08-31-logbook-quick-add.md` must be applied first — this plan's Task 2 rewrites `QuickAddFab.tsx` starting from that plan's end state (7 options: meal/workout/steps/walk/task/expense/sleep).

**Tech Stack:** Next.js 15 App Router, `openai` SDK pointed at OpenRouter (existing `lib/ai/modelConfig.ts` + `lib/ai/errors.ts`), `lucide-react`, no new dependencies.

## Global Constraints

- No test framework exists in this repo. Verification is `npx tsc --noEmit` + manual in-browser checks.
- `TaskCategory = 'life' | 'work'` and `TaskPriority = 'low' | 'medium' | 'high'` are defined in `lib/tasklog/types.ts` — reuse them, don't redefine.
- The new route must use `getModel(supabase, 'text')` from `lib/ai/modelConfig.ts` (same model resolution every other AI route uses), not a hardcoded model string.
- Do not add the AI badge to `LogCardsGrid` or anywhere outside the Quick Add sheet — out of scope per the spec.
- Steps gets no AI assistance (nothing for AI to estimate on a device-reported count) — do not add a `Sparkles` badge or AI call for it.

---

### Task 1: `POST /api/ai/categorize-task`

**Files:**
- Create: `app/api/ai/categorize-task/route.ts`

**Interfaces:**
- Produces: `POST /api/ai/categorize-task` — request body `{ title: string }`; success response `{ category: 'life' | 'work', priority: 'low' | 'medium' | 'high' }` (200); error response `{ error: string }` (400/401/502/500), consumed by Task 2's `TaskForm`.

- [ ] **Step 1: Create `app/api/ai/categorize-task/route.ts`**

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

const VALID_CATEGORIES = ['life', 'work'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

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
    const { title } = body as { title?: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const prompt = `You are triaging a personal task list.

Task title: "${title.trim()}"

Classify this task.
- category: "life" for personal/household/health/social tasks, "work" for job/career/business tasks.
- priority: "low", "medium", or "high" based on how urgent/important the title implies it is.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "category": "life" | "work",
  "priority": "low" | "medium" | "high"
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
    const category = result.category as string;
    const priority = result.priority as string;

    if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
      return NextResponse.json({ error: 'AI response had an invalid category' }, { status: 502 });
    }
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return NextResponse.json({ error: 'AI response had an invalid priority' }, { status: 502 });
    }

    return NextResponse.json({ category, priority });
  } catch (error) {
    console.error('categorize-task error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `categorize-task`.

- [ ] **Step 3: Manual verification with curl**

Start the dev server if not already running (`npm run dev -- --port 3100`), then, while logged in via the browser, copy the `sb-*-auth-token` cookie value from devtools and run:

```bash
curl -s -X POST http://localhost:3100/api/ai/categorize-task \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste the sb-*-auth-token cookie pair here>" \
  -d '{"title":"Prepare Q3 budget deck for the board"}'
```

Expected: `{"category":"work","priority":...}` with a valid priority — not a 401/400/500. (401 means the cookie wasn't pasted correctly; this route requires an authenticated session like every other route in this repo.)

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/categorize-task/route.ts
git commit -m "$(cat <<'EOF'
feat(ai): add task category/priority categorization endpoint

Follows the same getModel + JSON-mode OpenRouter pattern as the
existing estimate-workout-calories route.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: AI badge on Quick Add tiles + AI-assisted Task form

**Files:**
- Modify: `app/(logbook)/logbook/_components/QuickAddFab.tsx` (starting from the end state of `docs/superpowers/plans/2026-08-31-logbook-quick-add.md`)

**Interfaces:**
- Consumes: `POST /api/ai/categorize-task` from Task 1. `TaskCategory`, `TaskPriority` from `@/lib/tasklog/types`.
- Produces: no change to `QuickAddFab`'s public props.

- [ ] **Step 1: Replace the full contents of `app/(logbook)/logbook/_components/QuickAddFab.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Plus,
  Flame,
  Dumbbell,
  Footprints,
  Route,
  ListChecks,
  Wallet,
  Moon,
  Sparkles,
  ChevronLeft,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { LogCaloriesModal } from '@/app/(burnlog)/dashboard/_components/quick-log/LogCaloriesModal';
import { LogWorkoutModal } from '@/app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal';
import { LogStepsModal } from '@/app/(burnlog)/dashboard/_components/quick-log/LogStepsModal';
import { WalkTrackerModal } from '@/app/(burnlog)/dashboard/_components/quick-log/WalkTrackerModal';
import { LogTransactionModal } from '@/app/(moneylog)/moneylog/_components/LogTransactionModal';
import type { TaskCategory, TaskPriority } from '@/lib/tasklog/types';

type QuickAddOption = 'meal' | 'workout' | 'steps' | 'walk' | 'task' | 'expense' | 'sleep';

interface QuickAddFabProps {
  profileId: string;
  onSaved: () => void;
}

const OPTIONS: { id: QuickAddOption; label: string; app: string; icon: LucideIcon; color: string; available: boolean; ai: boolean }[] = [
  { id: 'meal', label: 'Log Meal', app: 'burnlog', icon: Flame, color: '#F97316', available: true, ai: true },
  { id: 'workout', label: 'Log Workout', app: 'burnlog', icon: Dumbbell, color: '#F97316', available: true, ai: true },
  { id: 'steps', label: 'Log Steps', app: 'burnlog', icon: Footprints, color: '#F97316', available: true, ai: false },
  { id: 'walk', label: 'Track Walk', app: 'burnlog', icon: Route, color: '#F97316', available: true, ai: false },
  { id: 'task', label: 'Complete Task', app: 'tasklog', icon: ListChecks, color: '#3B82F6', available: true, ai: true },
  { id: 'expense', label: 'Log Expense', app: 'moneylog', icon: Wallet, color: '#22C55E', available: true, ai: true },
  { id: 'sleep', label: 'Log Sleep', app: 'lifelog', icon: Moon, color: '#8B5CF6', available: false, ai: false },
];

const TASK_CATEGORIES: readonly TaskCategory[] = ['life', 'work'];
const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];

function TaskForm({ profileId, onSaved, onCancel }: { profileId: string; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClientComponentClient();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('life');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Enter a task title first');
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch('/api/ai/categorize-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to suggest category. Pick manually.');
        return;
      }
      setCategory(data.category as TaskCategory);
      setPriority(data.priority as TaskPriority);
    } catch {
      setError('Network error. Pick category/priority manually.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) return setError('Enter a task title');

    setSaving(true);
    const { error: insertError } = await supabase
      .from('tasklog_tasks')
      .insert([{ profileId, title: title.trim(), category, priority, completedAt: new Date().toISOString() }]);
    setSaving(false);
    if (insertError) return setError(insertError.message);
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>What did you finish?</Label>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send project update" />
          <Button type="button" variant="outline" onClick={handleSuggest} disabled={suggesting} aria-label="Suggest category and priority with AI">
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TASK_CATEGORIES.map((c) => (
          <Button key={c} type="button" size="sm" variant={category === c ? 'default' : 'outline'} onClick={() => setCategory(c)} className="capitalize">
            {c}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TASK_PRIORITIES.map((p) => (
          <Button key={p} type="button" size="sm" variant={priority === p ? 'default' : 'outline'} onClick={() => setPriority(p)} className="capitalize">
            {p}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Logs it straight to done — no need to plan it first. Tap the sparkle to suggest category/priority from the title.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark done'}
        </Button>
      </div>
    </div>
  );
}

function SleepComingSoon({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Moon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Sleep logging is coming soon</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Lifelog isn&apos;t built yet, so there&apos;s nowhere to save this yet — check back later.
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={onCancel}>Back</Button>
    </div>
  );
}

const SAVED_MESSAGES: Record<QuickAddOption, string> = {
  meal: 'Meal logged',
  workout: 'Workout logged',
  steps: 'Steps logged',
  walk: 'Walk logged',
  task: 'Task marked done',
  expense: 'Expense logged',
  sleep: 'Sleep logged',
};

export function QuickAddFab({ profileId, onSaved }: QuickAddFabProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<QuickAddOption | null>(null);
  const { toast } = useToast();

  const close = () => {
    setOpen(false);
    setSelected(null);
  };

  const handleSaved = () => {
    if (selected) {
      toast({ description: SAVED_MESSAGES[selected] });
    }
    onSaved();
    close();
  };

  const selectedOption = OPTIONS.find((o) => o.id === selected);

  if (selected === 'meal') {
    return <LogCaloriesModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'workout') {
    return <LogWorkoutModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'steps') {
    return <LogStepsModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'walk') {
    return <WalkTrackerModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }
  if (selected === 'expense') {
    return <LogTransactionModal profileId={profileId} onClose={() => setSelected(null)} onSaved={handleSaved} />;
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              {selectedOption && (
                <button onClick={() => setSelected(null)} aria-label="Back" className="text-muted-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {selectedOption ? selectedOption.label : 'Quick add'}
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 overflow-y-auto">
            {!selectedOption && (
              <div className="grid grid-cols-2 gap-3">
                {OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelected(opt.id)}
                      className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-transform active:scale-[0.98]"
                    >
                      <span
                        className="relative flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${opt.color}1a` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: opt.color }} />
                        {opt.ai && (
                          <Sparkles
                            aria-label="AI-assisted"
                            className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-primary"
                          />
                        )}
                      </span>
                      <span className="text-sm font-medium">{opt.label}</span>
                      {!opt.available && <span className="text-[10px] text-muted-foreground">Coming soon</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {selected === 'task' && <TaskForm profileId={profileId} onSaved={handleSaved} onCancel={() => setSelected(null)} />}
            {selected === 'sleep' && <SleepComingSoon onCancel={() => setSelected(null)} />}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `QuickAddFab.tsx`.

- [ ] **Step 3: Manual verification in the browser**

With the dev server running:
1. Open `/logbook`, tap the Quick Add FAB. Confirm a small sparkle badge appears on the Log Meal, Log Workout, and Log Expense tiles, and NOT on Log Steps, Track Walk, or Log Sleep.
2. Tap "Complete Task". Confirm the sparkle badge is now on this tile too.
3. Type a work-sounding title (e.g. "Send invoice to client"), tap the sparkle button next to the input. Confirm a brief loading spinner, then the Category/Priority button rows update (e.g. "Work" highlighted).
4. Manually override the suggested category/priority by tapping a different button, then save. Confirm "Task marked done" toast and the task appears completed with your manually-chosen category/priority (check via `/tasklog`).

Expected: badge renders on exactly the four AI-assisted tiles, suggestion round-trip works, manual override still works, no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(logbook)/logbook/_components/QuickAddFab.tsx"
git commit -m "$(cat <<'EOF'
feat(logbook): AI badge on Quick Add tiles, AI task categorization

Sparkle badge marks the Meal/Workout/Expense/Task tiles as
AI-assisted; Task quick-complete gets an AI suggest button for
category/priority via the new categorize-task endpoint.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** `docs/superpowers/specs/2026-08-31-logbook-ai-icons-design.md` calls for a badge on AI-assisted Quick Add tiles (Task 2, Step 1's `opt.ai` badge), a new `categorize-task` route (Task 1), and wiring it into `TaskForm` with a user-editable suggestion (Task 2). Steps explicitly gets no AI (`ai: false`, no route call). `LogCardsGrid` is untouched — out of scope confirmed.
- **Placeholder scan:** none — both Task 1 and Task 2 give complete file contents.
- **Type consistency:** `TaskCategory`/`TaskPriority` imported from `@/lib/tasklog/types` and used identically in the route's validation arrays and the form's state — no redefinition drift.
