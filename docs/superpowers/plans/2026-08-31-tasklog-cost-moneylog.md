# TaskLog Cost-Tagged Tasks → MoneyLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a TaskLog task carry an optional cost + MoneyLog category; when the task is completed, log it as a MoneyLog expense exactly once.

**Architecture:** The database migration (`cost`, `costCategory`, `costLoggedAt` columns on `tasklog_tasks`) is already applied directly against the live Supabase project — this plan only needs `prisma/schema.prisma` updated to match. `lib/tasklog/types.ts`'s `TaskRow` gets the three new fields. `TaskDetailSheet.tsx` gets a cost input + category select. `lib/tasklog/completeTask.ts`'s `markTaskComplete()` — the single existing entry point for task completion, already called from all three completion sites — gets the ledger-write logic. Three call sites get small edits to pass the new fields through.

**Tech Stack:** Next.js client components, `@supabase/supabase-js` query builder, Prisma schema (source-of-truth documentation; the actual migration already ran).

## Global Constraints

- The `cost`/`costCategory`/`costLoggedAt` columns already exist in the live database (`double precision`, `text`, `timestamp without time zone` respectively) — do not attempt to create them again; only update `prisma/schema.prisma` to document them.
- Ledger write fires only when `task.cost > 0` and `task.costLoggedAt` is not already set. After a successful write, `costLoggedAt` must be set on the task row so it never fires again for that task.
- Category: `task.costCategory ?? 'other_expense'` — never a hardcoded category regardless of what the user picked.
- Label format: `` `TaskLog: ${task.title ?? 'Task'}` ``.
- The ledger write and the `costLoggedAt` update are both `await`ed, matching `markTaskComplete`'s existing sequential-await style — no fire-and-forget, no individual try/catch around this step (matches how the function's other side effects, `recomputeGoalProgress`/`maybeAdvanceTaskLogStreak`, are also un-wrapped).
- Full design spec: `docs/superpowers/specs/2026-08-31-tasklog-cost-moneylog-design.md`

---

### Task 1: Update `prisma/schema.prisma` and `lib/tasklog/types.ts`

**Files:**
- Modify: `prisma/schema.prisma` (the `Task` model, currently at line 577)
- Modify: `lib/tasklog/types.ts` (the `TaskRow` interface, currently at line 7)

**Interfaces:**
- Produces: `TaskRow` now has `cost: number | null`, `costCategory: string | null`, `costLoggedAt: string | null`. Tasks 2 and 3 both consume these exact field names and types.

- [ ] **Step 1: Update the Prisma schema**

In `prisma/schema.prisma`, find the `Task` model (starts at line 577, ends with `@@map("tasklog_tasks")`). Add three fields right before the closing `@@map` line:

```prisma
model Task {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile   @relation(fields: [profileId], references: [id])
  profileId       String    @db.Uuid
  goal            TaskGoal? @relation(fields: [goalId], references: [id])
  goalId          String?   @db.Uuid
  idea            Idea?     @relation(fields: [ideaId], references: [id])
  ideaId          String?   @db.Uuid
  title           String
  notes           String?
  category        String // 'life' | 'work'
  priority        String    @default("medium") // 'low' | 'medium' | 'high'
  lane            String? // null = Plan inbox; else 'todo' | 'in_progress' | 'done'
  dueDate         DateTime? @db.Date
  plannedForToday Boolean   @default(false)
  position        Int       @default(0)
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  cost            Float?
  costCategory    String?
  costLoggedAt    DateTime?

  @@map("tasklog_tasks")
}
```

(Only the three new lines — `cost`, `costCategory`, `costLoggedAt` — and their placement before `@@map` are the actual change; everything else in the model is unchanged, shown here for exact placement context.)

- [ ] **Step 2: Update `TaskRow`**

In `lib/tasklog/types.ts`, add three fields to the `TaskRow` interface, after `createdAt`:

```ts
export interface TaskRow {
  id: string;
  profileId: string;
  goalId: string | null;
  title: string;
  notes: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  lane: TaskLane | null;
  dueDate: string | null; // 'YYYY-MM-DD'
  plannedForToday: boolean;
  position: number;
  completedAt: string | null;
  createdAt: string;
  cost: number | null;
  costCategory: string | null;
  costLoggedAt: string | null;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors (existing code that constructs/destructures `TaskRow` objects without these fields still compiles, since they're all present as `| null` on read but nothing requires them on construction of a *literal* typed as `TaskRow` unless TypeScript's excess-property/missing-property checks apply — if `npx prisma generate` needs to run for the Prisma Client types to pick up the schema change, run it: `npx prisma generate`. If any `.insert([{ ... }])` call typed against a generated Prisma type now complains about missing fields, that's expected only if such a call constructs a full `Task` — none of the plan's existing insert sites do this for `tasklog_tasks`, so no other files should need changes here).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma lib/tasklog/types.ts
git commit -m "feat(tasklog): add cost fields to Task schema and TaskRow type"
```

---

### Task 2: Add cost + category fields to the task edit dialog

**Files:**
- Modify: `app/(tasklog)/tasklog/board/_components/TaskDetailSheet.tsx`

**Interfaces:**
- Consumes: `EXPENSE_CATEGORIES` from `@/lib/financeCategories` (array of `{ value: string; label: string }`).
- Consumes: `TaskRow.cost`, `TaskRow.costCategory` (Task 1).
- Produces: `onSave`'s `updates` payload now includes `cost: number | null` and `costCategory: string | null` — Task 3's call sites don't consume this directly (they read from the *saved* `TaskRow`, not from this form), but Task 3's `handleSaveTask` completion-detection path does read the `updated` row returned from the database after this form's save, so the values must round-trip correctly.

- [ ] **Step 1: Add state and the import**

In `app/(tasklog)/tasklog/board/_components/TaskDetailSheet.tsx`, add this import alongside the existing ones:

```ts
import { EXPENSE_CATEGORIES } from '@/lib/financeCategories';
```

Add two new pieces of state alongside the existing `dueDate` state:

```ts
  const [cost, setCost] = useState('');
  const [costCategory, setCostCategory] = useState('');
```

- [ ] **Step 2: Populate state from the task in the existing `useEffect`**

Find this block:

```ts
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? '');
    setCategory(task.category);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? '');
  }, [task]);
```

Add two lines inside it:

```ts
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? '');
    setCategory(task.category);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? '');
    setCost(task.cost != null ? String(task.cost) : '');
    setCostCategory(task.costCategory ?? '');
  }, [task]);
```

- [ ] **Step 3: Include cost fields in the save payload**

Find `handleSave`:

```ts
  async function handleSave() {
    if (!task) return;
    setSaving(true);
    try {
      await onSave(task.id, {
        title: title.trim() || task.title,
        notes: notes.trim() || null,
        category,
        priority,
        dueDate: dueDate || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }
```

Change the `onSave` call to include cost fields:

```ts
  async function handleSave() {
    if (!task) return;
    setSaving(true);
    try {
      const parsedCost = cost.trim() ? Number(cost) : null;
      await onSave(task.id, {
        title: title.trim() || task.title,
        notes: notes.trim() || null,
        category,
        priority,
        dueDate: dueDate || null,
        cost: parsedCost,
        costCategory: parsedCost ? costCategory || 'other_expense' : null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 4: Add the form fields**

Find the "Due date" field block (the last field before `</div>` closes the form body):

```tsx
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
```

Add a new section right after it, still inside the same form-body `<div className="space-y-3">`:

```tsx
          <div className="space-y-1.5">
            <Label>Cost (optional)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          {cost.trim() && Number(cost) > 0 && (
            <div className="space-y-1.5">
              <Label>Expense category</Label>
              <Select value={costCategory} onValueChange={setCostCategory}>
                <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(tasklog)/tasklog/board/_components/TaskDetailSheet.tsx"
git commit -m "feat(tasklog): add cost + expense category fields to task edit dialog"
```

---

### Task 3: Log the MoneyLog expense on task completion

**Files:**
- Modify: `lib/tasklog/completeTask.ts`
- Modify: `app/(tasklog)/tasklog/page.tsx` (dashboard checkbox call site)
- Modify: `app/(tasklog)/tasklog/board/page.tsx` (drag-to-done and detail-sheet-save call sites)

**Interfaces:**
- Consumes: `TaskRow.cost`, `TaskRow.costCategory`, `TaskRow.costLoggedAt` (Task 1).
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Extend `CompletableTask` and add the ledger-write logic**

In `lib/tasklog/completeTask.ts`, change the interface:

```ts
interface CompletableTask {
  id: string;
  goalId: string | null;
  title?: string;
  cost?: number | null;
  costCategory?: string | null;
  costLoggedAt?: string | null;
}
```

Then, inside `markTaskComplete`, in the existing `if (completed) { ... }` block, add the ledger-write logic after the existing `fetch('/api/sociallog/activity', ...)` call (i.e. as the last thing in that block):

```ts
export async function markTaskComplete(
  supabase: SupabaseClient,
  task: CompletableTask,
  profile: StreakProfile,
  completed: boolean
): Promise<void> {
  await supabase
    .from('tasklog_tasks')
    .update({
      completedAt: completed ? new Date().toISOString() : null,
      lane: completed ? 'done' : undefined,
    })
    .eq('id', task.id);

  if (completed) {
    if (task.goalId) {
      await recomputeGoalProgress(supabase, task.goalId);
    }
    await maybeAdvanceTaskLogStreak(supabase, profile);

    fetch('/api/sociallog/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceApp: 'tasklog',
        sourceRefType: 'task_completed',
        sourceRefId: task.id,
        body: task.title ? `Completed "${task.title}"` : 'Completed a task',
      }),
    }).catch(() => {
      // Best-effort — a failed activity post must never block task completion.
    });

    if (task.cost && task.cost > 0 && !task.costLoggedAt) {
      await supabase.from('finance_transactions').insert({
        profileId: profile.id,
        type: 'expense',
        category: task.costCategory ?? 'other_expense',
        label: `TaskLog: ${task.title ?? 'Task'}`,
        amount: task.cost,
      });
      await supabase.from('tasklog_tasks').update({ costLoggedAt: new Date().toISOString() }).eq('id', task.id);
    }
  }
}
```

- [ ] **Step 2: Update the dashboard call site**

In `app/(tasklog)/tasklog/page.tsx`, find:

```ts
    await markTaskComplete(supabase, { id: task.id, goalId: task.goalId, title: task.title }, toStreakProfile(profile.id, profile), completed);
```

Change to:

```ts
    await markTaskComplete(
      supabase,
      { id: task.id, goalId: task.goalId, title: task.title, cost: task.cost, costCategory: task.costCategory, costLoggedAt: task.costLoggedAt },
      toStreakProfile(profile.id, profile),
      completed
    );
```

- [ ] **Step 3: Update the board drag-to-done call site**

In `app/(tasklog)/tasklog/board/page.tsx`, find:

```ts
      await markTaskComplete(supabase, { id: movedTask.id, goalId: movedTask.goalId, title: movedTask.title }, toStreakProfile(profile.id, profile), true);
```

Change to:

```ts
      await markTaskComplete(
        supabase,
        { id: movedTask.id, goalId: movedTask.goalId, title: movedTask.title, cost: movedTask.cost, costCategory: movedTask.costCategory, costLoggedAt: movedTask.costLoggedAt },
        toStreakProfile(profile.id, profile),
        true
      );
```

- [ ] **Step 4: Update the board detail-sheet-save call site**

In the same file, find:

```ts
      await markTaskComplete(supabase, { id: updated.id, goalId: updated.goalId, title: updated.title }, toStreakProfile(profile.id, profile), true);
```

Change to:

```ts
      await markTaskComplete(
        supabase,
        { id: updated.id, goalId: updated.goalId, title: updated.title, cost: updated.cost, costCategory: updated.costCategory, costLoggedAt: updated.costLoggedAt },
        toStreakProfile(profile.id, profile),
        true
      );
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/tasklog/completeTask.ts "app/(tasklog)/tasklog/page.tsx" "app/(tasklog)/tasklog/board/page.tsx"
git commit -m "feat(tasklog): log MoneyLog expense on completion of a costed task"
```

---

### Task 4: Full type-check and manual verification

**Files:** None (verification-only task).

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, then in the browser:
1. Open a task's edit dialog, set cost to `25.50`, category "Groceries", save. Reopen the dialog and confirm the cost/category persisted.
2. Mark the task complete via the dashboard checkbox. Confirm a MoneyLog expense appears: `-$25.50`, category "Groceries", label `TaskLog: <task title>`.
3. Mark the task incomplete, then complete again. Confirm no second MoneyLog entry appears.
4. Complete a task with no cost set. Confirm no MoneyLog entry is created.
5. Drag a costed task to the "Done" column on the board (not the checkbox or detail-sheet path) and confirm the ledger entry still fires exactly once.

- [ ] **Step 3: No commit needed** (verification-only task; if any fix was required, commit that fix with an appropriate message before moving on).
