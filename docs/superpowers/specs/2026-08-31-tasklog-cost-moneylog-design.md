# TaskLog Cost-Tagged Tasks → MoneyLog — Design

**Date:** 2026-08-31
**Status:** Approved design, implementing directly per explicit user direction
**Parent effort:** Third of six planned "connect the apps" integrations.

## Goal

Let a task carry an optional cost. When that task is completed, log it as a MoneyLog expense automatically — no manual re-entry for costs already tracked in TaskLog (e.g. "renew car registration — $120").

## Non-Goals

- Uncompleting a costed task never reverses or refunds the logged MoneyLog expense — same "no reconciliation on edits" stance as the HomeLog bills integration.
- No cost field on the quick-add flow — only the full task edit dialog (`TaskDetailSheet`).
- No new UI anywhere in MoneyLog — it already renders any category dynamically.
- No retroactive logging for tasks completed before this feature ships (`costLoggedAt` starts `null` for all existing rows; a task completed in the past with no `cost` set has nothing to log).

## Decisions (locked during brainstorming)

1. **Schema:** three new nullable columns on `tasklog_tasks` — `cost Float?`, `costCategory String?` (a MoneyLog `EXPENSE_CATEGORIES` value, meaningful only when `cost` is set), `costLoggedAt DateTime?` (guards against double-logging when a task is toggled complete → incomplete → complete again).
2. **Migration application:** applied directly against the live Supabase project via the Supabase MCP tool (`apply_migration`), then `prisma/schema.prisma` updated to match — not left as a manual step for the user.
3. **Category:** the user picks a MoneyLog expense category per task (via a `Select` populated from `EXPENSE_CATEGORIES`), not a fixed `other_expense` default — shown only once a cost is entered.
4. **Injection point:** `lib/tasklog/completeTask.ts`'s `markTaskComplete()` — the codebase's single existing entry point for "a task became complete," already called from all three places that can complete a task today (dashboard checkbox in `app/(tasklog)/tasklog/page.tsx`, board drag-to-done and board detail-sheet save in `app/(tasklog)/tasklog/board/page.tsx`). Adding the ledger write here means every current and future completion path gets it automatically, with no duplicated logic.
5. **Double-log guard:** `costLoggedAt` is checked before logging and set immediately after — a task can only ever generate one MoneyLog entry, regardless of how many times it's toggled complete/incomplete.
6. **Write style:** `await`ed, not fire-and-forget. Unlike the HomeLog case (a serverless API route where an un-awaited promise scheduled right before the response risks being dropped), this write happens inside a client-side function whose caller already `await`s the whole thing — there's no "response already sent" race to avoid, and the rest of `markTaskComplete` is already sequential `await`s.

## Architecture

### Database

New columns on `tasklog_tasks`:
```sql
ALTER TABLE tasklog_tasks
  ADD COLUMN cost double precision,
  ADD COLUMN "costCategory" text,
  ADD COLUMN "costLoggedAt" timestamptz;
```

Applied via the Supabase MCP tool directly (not deferred). `prisma/schema.prisma`'s `Task` model gets matching fields:
```prisma
cost         Float?
costCategory String?
costLoggedAt DateTime?
```

### `lib/tasklog/types.ts`

`TaskRow` gains three fields matching the new columns:
```ts
cost: number | null;
costCategory: string | null;
costLoggedAt: string | null;
```

### `app/(tasklog)/tasklog/board/_components/TaskDetailSheet.tsx`

Two new pieces of local state, `cost` (string, for the number input) and `costCategory` (string). Populated from `task.cost`/`task.costCategory` in the existing `useEffect`. A new form section: a "Cost" number input, and — rendered only when the cost input has a nonzero value — a "Category" `Select` populated from `EXPENSE_CATEGORIES` (imported from `lib/financeCategories.ts`). Both included in `handleSave`'s `onSave` payload: `cost: cost ? Number(cost) : null, costCategory: cost ? costCategory : null`.

### `lib/tasklog/completeTask.ts`

`CompletableTask` interface gains `cost?: number | null`, `costCategory?: string | null`, `costLoggedAt?: string | null`. Inside `markTaskComplete`, in the existing `if (completed) { ... }` block, after the existing goal-progress/streak/activity-post steps:

```ts
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
```

### Call sites (three files, small edits)

Each of the three places that build a `CompletableTask` object literal to pass into `markTaskComplete` adds the three new fields, sourced from the local `TaskRow` they already have in scope:
- `app/(tasklog)/tasklog/page.tsx` (`handleToggle`, dashboard checkbox)
- `app/(tasklog)/tasklog/board/page.tsx` (drag-to-done handler)
- `app/(tasklog)/tasklog/board/page.tsx` (`handleSaveTask`, detail-sheet save path)

## Error Handling

The `finance_transactions` insert and the `costLoggedAt` update are `await`ed sequentially, matching the rest of `markTaskComplete`. If either fails, it's a genuine error in this codebase's existing convention for this function (none of the other steps in `markTaskComplete` are individually try/caught — a failure here surfaces the same way a `recomputeGoalProgress` or `maybeAdvanceTaskLogStreak` failure would today, i.e. it propagates to the caller). This intentionally does *not* copy the fail-soft/never-throw posture from the HomeLog and ShoppingLog precedents, because `markTaskComplete`'s own existing code has no such posture for its other side effects — matching the file's established convention takes priority over matching a different file's convention.

## Testing

Manual (no automated tests exist for `completeTask.ts` or its callers today):

1. Edit a task, set cost to `25.50` and category "Groceries", save. Confirm no MoneyLog entry yet (only completion triggers it).
2. Mark the task complete via the dashboard checkbox. Confirm a MoneyLog expense appears: `-$25.50`, category "Groceries", label `TaskLog: <task title>`.
3. Mark the same task incomplete, then complete again. Confirm no second MoneyLog entry appears (guarded by `costLoggedAt`).
4. Complete a task with no cost set. Confirm no MoneyLog entry is created (existing behavior unaffected).
5. Complete a task via board drag-to-done (not just the checkbox/detail-sheet paths) and confirm the ledger entry still fires — proving the shared-entry-point design works across all three completion paths without per-site logic.
