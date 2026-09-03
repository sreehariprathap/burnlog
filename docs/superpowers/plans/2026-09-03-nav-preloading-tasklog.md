# Nav Preloading — TaskLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the nav-preloading mechanism to TaskLog: nav-link prefetch, a query registry, converting TaskLog's four nav tabs to it, wiring the preload into `TaskLogBottomNav`, and a `loading.tsx`.

**Architecture:** Same mechanism as BurnLog/MoneyLog. TaskLog is the simplest of the three so far: every nav-tab page (`page.tsx`, `board/page.tsx`, `plan/page.tsx`, `goals/page.tsx`) already uses `useCurrentProfile()` and already keys its `useSWR` calls with a stable, correctly-scoped key (`'tasklog-today'`, `'tasklog-board'`, `'tasklog-inbox'`, `'tasklog-ideas'`, `'tasklog-idea-task-counts'`, `'tasklog-goals'`) — no drift bugs like BurnLog's duplicate `fitness_goals` fetches or MoneyLog's triplicated `recurring_items` fetches exist here. This plan's job is narrower: extract each page's existing key+fetcher pair into `lib/tasklog/queries.ts` so `TaskLogBottomNav` can preload the exact same cache entries, then swap each page to consume the registry instead of its inline fetcher (so the two can never drift apart later).

**Tech Stack:** Next.js App Router, `swr@2.5.1`, Supabase JS client, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-nav-preloading-design.md`
**Prior plans (shared mechanism, already merged):**
- `docs/superpowers/plans/2026-09-03-nav-preloading-foundation-burnlog.md`
- `docs/superpowers/plans/2026-09-03-nav-preloading-moneylog.md`

## Global Constraints

- Every touched file must pass `npx tsc --noEmit -p .` and `npx eslint <file>` with zero new errors/warnings before its task is considered done.
- No new dependencies.
- SWR key convention: `` [`${app}-${resource}`, profileId] `` — this app already follows it (`'tasklog-today'`, `'tasklog-board'`, etc.); the registry keeps those exact strings unchanged so no cache entries are orphaned by a rename.
- Zero `.tsx` component tests exist in this repo — give every new testable pure function a real Vitest test, matching `lib/burnlog/queries.test.ts`/`lib/moneylog/queries.test.ts`. Verify React glue via `tsc`/`eslint` plus manual steps.
- `usePreloadRoutes`/`PreloadableQuery` (`lib/usePreloadRoutes.ts`) already exist — do not redefine them.
- **Known gotcha from the MoneyLog plan, avoid repeating it:** if any registry fetcher's real implementation depends on a module that transitively imports a `.tsx` component file (e.g. anything importing `@/lib/apiFetch`, which pulls in `components/ui/use-toast.tsx`), its unit test must `vi.mock` that dependency before import — this repo's Vitest setup has never needed to transform `.tsx` files and doing so breaks the test run. None of TaskLog's six fetchers below call `apiFetch` (they're all direct Supabase calls), so this shouldn't recur here, but check it if a fetcher's test fails with a JSX parse error.

---

## File Structure

New files:
- `lib/tasklog/queries.ts` — TaskLog's query registry: `todayTasksQuery`, `boardTasksQuery`, `inboxTasksQuery`, `ideasQuery`, `ideaTaskCountsQuery`, `goalsQuery`.
- `lib/tasklog/queries.test.ts` — Vitest coverage for all six fetchers/factories.
- `app/(tasklog)/tasklog/loading.tsx` — Suspense fallback for `/tasklog/*`.

Modified files:
- `components/TaskLogBottomNav.tsx` — add `prefetch` to its tab `<Link>`s (never had it) and wire `usePreloadRoutes`.
- `app/(tasklog)/tasklog/page.tsx` (home) — consume `todayTasksQuery` instead of its inline fetcher.
- `app/(tasklog)/tasklog/board/page.tsx` — consume `boardTasksQuery` instead of its inline fetcher.
- `app/(tasklog)/tasklog/plan/page.tsx` — consume `inboxTasksQuery`, `ideasQuery`, `ideaTaskCountsQuery` instead of its three inline fetchers.
- `app/(tasklog)/tasklog/goals/page.tsx` — consume `goalsQuery` instead of its inline fetcher.

No deep page in scope — the spec's table lists none for TaskLog (its board/plan/goals tabs cover the app's full surface; there's no separate high-traffic detail screen linked from the home tab the way BurnLog has meal-planner or MoneyLog has assets).

No Server Component exclusion needed either — unlike BurnLog's Insights and MoneyLog's Insights, every TaskLog nav tab is already a Client Component using `useSWR`.

---

## Task 1: TaskLog query registry

**Files:**
- Create: `lib/tasklog/queries.ts`
- Test: `lib/tasklog/queries.test.ts`

**Interfaces:**
- Consumes: `TaskRow`, `IdeaRow`, `TaskGoalRow` types (existing, `lib/tasklog/types.ts`).
- Produces:
  - `fetchTodayTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]>`
  - `todayTasksQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<TaskRow[]> }`
  - `fetchBoardTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]>`
  - `boardTasksQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<TaskRow[]> }`
  - `fetchInboxTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]>`
  - `inboxTasksQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<TaskRow[]> }`
  - `fetchIdeas(supabase: SupabaseClient, profileId: string): Promise<IdeaRow[]>`
  - `ideasQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<IdeaRow[]> }`
  - `fetchIdeaTaskCounts(supabase: SupabaseClient, profileId: string): Promise<{ ideaId: string }[]>`
  - `ideaTaskCountsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<{ ideaId: string }[]> }`
  - `fetchGoals(supabase: SupabaseClient, profileId: string): Promise<TaskGoalRow[]>`
  - `goalsQuery(profileId: string): { key: readonly [string, string]; fetcher: () => Promise<TaskGoalRow[]> }`

- [ ] **Step 1: Write the registry**

```ts
// lib/tasklog/queries.ts
//
// Single source of truth for TaskLog's preloadable page queries — same
// pattern as lib/burnlog/queries.ts and lib/moneylog/queries.ts. Every key
// here matches the string this app's pages already used before this
// registry existed (see e.g. app/(tasklog)/tasklog/page.tsx's
// ['tasklog-today', profileId]) — unchanged on purpose, so no cache entry
// is orphaned by a rename.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { todayDateString, type TaskRow, type IdeaRow } from '@/lib/tasklog/types';
import type { TaskGoalRow } from '@/lib/tasklog/types';

export async function fetchTodayTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]> {
  const today = todayDateString();
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('*')
    .eq('profileId', profileId)
    .or(`dueDate.eq.${today},plannedForToday.eq.true`)
    .order('dueDate', { ascending: true });
  return (data as TaskRow[]) ?? [];
}

export function todayTasksQuery(profileId: string) {
  return {
    key: ['tasklog-today', profileId] as const,
    fetcher: () => fetchTodayTasks(createClient(), profileId),
  };
}

export async function fetchBoardTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('*')
    .eq('profileId', profileId)
    .not('lane', 'is', null)
    .order('position', { ascending: true });
  return (data as TaskRow[]) ?? [];
}

export function boardTasksQuery(profileId: string) {
  return {
    key: ['tasklog-board', profileId] as const,
    fetcher: () => fetchBoardTasks(createClient(), profileId),
  };
}

export async function fetchInboxTasks(supabase: SupabaseClient, profileId: string): Promise<TaskRow[]> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('*')
    .eq('profileId', profileId)
    .is('lane', null)
    .order('createdAt', { ascending: false });
  return (data as TaskRow[]) ?? [];
}

export function inboxTasksQuery(profileId: string) {
  return {
    key: ['tasklog-inbox', profileId] as const,
    fetcher: () => fetchInboxTasks(createClient(), profileId),
  };
}

export async function fetchIdeas(supabase: SupabaseClient, profileId: string): Promise<IdeaRow[]> {
  const { data } = await supabase
    .from('tasklog_ideas')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  return (data as IdeaRow[]) ?? [];
}

export function ideasQuery(profileId: string) {
  return {
    key: ['tasklog-ideas', profileId] as const,
    fetcher: () => fetchIdeas(createClient(), profileId),
  };
}

export async function fetchIdeaTaskCounts(supabase: SupabaseClient, profileId: string): Promise<{ ideaId: string }[]> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('ideaId')
    .eq('profileId', profileId)
    .not('ideaId', 'is', null);
  return (data as { ideaId: string }[]) ?? [];
}

export function ideaTaskCountsQuery(profileId: string) {
  return {
    key: ['tasklog-idea-task-counts', profileId] as const,
    fetcher: () => fetchIdeaTaskCounts(createClient(), profileId),
  };
}

export async function fetchGoals(supabase: SupabaseClient, profileId: string): Promise<TaskGoalRow[]> {
  const { data } = await supabase
    .from('task_goals')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  return (data as TaskGoalRow[]) ?? [];
}

export function goalsQuery(profileId: string) {
  return {
    key: ['tasklog-goals', profileId] as const,
    fetcher: () => fetchGoals(createClient(), profileId),
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/tasklog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  fetchTodayTasks,
  fetchBoardTasks,
  fetchInboxTasks,
  fetchIdeas,
  fetchIdeaTaskCounts,
  fetchGoals,
  todayTasksQuery,
  boardTasksQuery,
  inboxTasksQuery,
  ideasQuery,
  ideaTaskCountsQuery,
  goalsQuery,
} from './queries';

// Same thenable-and-chainable shape as the BurnLog/MoneyLog registry tests
// — Supabase query builders can be awaited directly at any step, or
// chained further, and this mock supports both.
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const order = vi.fn().mockReturnValue(makeThenable({}));
  const orChain = makeThenable({ order });
  const notChain = makeThenable({ order });
  const isChain = makeThenable({ order });
  const eqChain = makeThenable({
    or: vi.fn().mockReturnValue(orChain),
    not: vi.fn().mockReturnValue(notChain),
    is: vi.fn().mockReturnValue(isChain),
    order,
  });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqChain) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchTodayTasks', () => {
  it('returns today\'s/planned tasks', async () => {
    const tasks = [{ id: 't1', title: 'Ship it', dueDate: '2026-09-03' }];
    const supabase = fakeSupabase({ data: tasks, error: null });
    const result = await fetchTodayTasks(supabase, 'profile-1');
    expect(result).toEqual(tasks);
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchTodayTasks(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchBoardTasks', () => {
  it('returns lane-assigned tasks ordered by position', async () => {
    const tasks = [{ id: 't1', lane: 'todo', position: 0 }];
    const supabase = fakeSupabase({ data: tasks, error: null });
    const result = await fetchBoardTasks(supabase, 'profile-1');
    expect(result).toEqual(tasks);
  });
});

describe('fetchInboxTasks', () => {
  it('returns lane-less (Plan inbox) tasks', async () => {
    const tasks = [{ id: 't1', lane: null }];
    const supabase = fakeSupabase({ data: tasks, error: null });
    const result = await fetchInboxTasks(supabase, 'profile-1');
    expect(result).toEqual(tasks);
  });
});

describe('fetchIdeas', () => {
  it('returns the profile\'s ideas', async () => {
    const ideas = [{ id: 'i1', title: 'Launch a bakery' }];
    const supabase = fakeSupabase({ data: ideas, error: null });
    const result = await fetchIdeas(supabase, 'profile-1');
    expect(result).toEqual(ideas);
  });
});

describe('fetchIdeaTaskCounts', () => {
  it('returns rows of ideaId for tasks linked to an idea', async () => {
    const rows = [{ ideaId: 'i1' }, { ideaId: 'i1' }];
    const supabase = fakeSupabase({ data: rows, error: null });
    const result = await fetchIdeaTaskCounts(supabase, 'profile-1');
    expect(result).toEqual(rows);
  });
});

describe('fetchGoals', () => {
  it('returns the profile\'s task goals', async () => {
    const goals = [{ id: 'g1', title: 'Get fit' }];
    const supabase = fakeSupabase({ data: goals, error: null });
    const result = await fetchGoals(supabase, 'profile-1');
    expect(result).toEqual(goals);
  });
});

describe('registry key shapes', () => {
  it('todayTasksQuery keys by app+resource+profileId', () => {
    expect(todayTasksQuery('profile-1').key).toEqual(['tasklog-today', 'profile-1']);
  });

  it('boardTasksQuery keys by app+resource+profileId', () => {
    expect(boardTasksQuery('profile-1').key).toEqual(['tasklog-board', 'profile-1']);
  });

  it('inboxTasksQuery keys by app+resource+profileId', () => {
    expect(inboxTasksQuery('profile-1').key).toEqual(['tasklog-inbox', 'profile-1']);
  });

  it('ideasQuery keys by app+resource+profileId', () => {
    expect(ideasQuery('profile-1').key).toEqual(['tasklog-ideas', 'profile-1']);
  });

  it('ideaTaskCountsQuery keys by app+resource+profileId', () => {
    expect(ideaTaskCountsQuery('profile-1').key).toEqual(['tasklog-idea-task-counts', 'profile-1']);
  });

  it('goalsQuery keys by app+resource+profileId', () => {
    expect(goalsQuery('profile-1').key).toEqual(['tasklog-goals', 'profile-1']);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/tasklog/queries.test.ts`
Expected: all tests PASS. If any `fetch*` test fails with the mock resolving to the wrong shape, check whether that fetcher's Supabase chain length (number of `.eq()`/`.or()`/`.not()`/`.is()` calls before the implicit await) matches what `fakeSupabase` above provides at that depth — extend the mock's chain (not the source file) to match, the same fix pattern used in both prior plans.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/tasklog/queries"` — expect no output.
Run: `npx eslint lib/tasklog/queries.ts lib/tasklog/queries.test.ts` — expect no output.

- [ ] **Step 5: Commit**

```bash
git add lib/tasklog/queries.ts lib/tasklog/queries.test.ts
git commit -m "$(cat <<'EOF'
feat: add TaskLog query registry (today, board, inbox, ideas, idea-task-counts, goals)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 2: Convert `page.tsx` (home) to `todayTasksQuery`

**Files:**
- Modify: `app/(tasklog)/tasklog/page.tsx`

**Interfaces:**
- Consumes: `todayTasksQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
  const {
    data: todayTasks,
    isLoading,
    mutate: refreshToday,
  } = useSWR(profile ? ['tasklog-today', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profile!.id)
      .or(`dueDate.eq.${today},plannedForToday.eq.true`)
      .order('dueDate', { ascending: true });
    return (data as TaskRow[]) || [];
  });
```

to:

```tsx
  const {
    data: todayTasks,
    isLoading,
    mutate: refreshToday,
  } = useSWR(
    profile ? todayTasksQuery(profile.id).key : null,
    profile ? todayTasksQuery(profile.id).fetcher : null
  );
```

Add the import:

```tsx
import { todayTasksQuery } from '@/lib/tasklog/queries';
```

`const today = todayDateString();` earlier in the file may now be unused if nothing else in the page reads `today` besides the removed fetcher — check with:

Run: `grep -n "\btoday\b" "app/(tasklog)/tasklog/page.tsx"`

If `today` is still referenced elsewhere (e.g. in the `overdue`/`dueToday` filters a few lines below, which the file's earlier read shows: `tasks.filter((t) => t.dueDate && t.dueDate < today && ...)`), keep the `const today = todayDateString();` declaration — only the fetcher's own internal use of it moves into the registry's `fetchTodayTasks` (which calls `todayDateString()` itself).

`supabase` (`const supabase = createClient();`) may also become unused in this file if nothing else in the page calls it directly — check with `grep -n "supabase\." "app/(tasklog)/tasklog/page.tsx"` and remove the declaration/import only if that grep's only remaining hit was the fetcher just deleted.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "app/(tasklog)/tasklog/page"` — expect no output.
Run: `npx eslint "app/(tasklog)/tasklog/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(tasklog)/tasklog/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: TaskLog home page consumes shared todayTasksQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 3: Convert `board/page.tsx` to `boardTasksQuery`

**Files:**
- Modify: `app/(tasklog)/tasklog/board/page.tsx`

**Interfaces:**
- Consumes: `boardTasksQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
  const {
    data: taskData,
    isLoading,
    mutate: mutateTasks,
  } = useSWR(profile ? ['tasklog-board', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profile!.id)
      .not('lane', 'is', null)
      .order('position', { ascending: true });
    return (data as TaskRow[]) || [];
  });
```

to:

```tsx
  const {
    data: taskData,
    isLoading,
    mutate: mutateTasks,
  } = useSWR(
    profile ? boardTasksQuery(profile.id).key : null,
    profile ? boardTasksQuery(profile.id).fetcher : null
  );
```

Add the import:

```tsx
import { boardTasksQuery } from '@/lib/tasklog/queries';
```

`supabase` (`const supabase = createClient();`) stays — this page's drag-and-drop handlers (`tasklog_tasks` position updates), the quick-add form insert, and delete all still call it directly (confirmed by the earlier research: lines using `supabase.from('tasklog_tasks').update(...)` and `.delete()` elsewhere in this file).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "board/page"` — expect no output.
Run: `npx eslint "app/(tasklog)/tasklog/board/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(tasklog)/tasklog/board/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: board page consumes shared boardTasksQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 4: Convert `plan/page.tsx` to `inboxTasksQuery`/`ideasQuery`/`ideaTaskCountsQuery`

**Files:**
- Modify: `app/(tasklog)/tasklog/plan/page.tsx`

**Interfaces:**
- Consumes: `inboxTasksQuery`, `ideasQuery`, `ideaTaskCountsQuery` (Task 1).

- [ ] **Step 1: Replace the three inline fetchers**

Change:

```tsx
  const {
    data: inboxData,
    isLoading,
    mutate: mutateInbox,
  } = useSWR(profile ? ['tasklog-inbox', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profile!.id)
      .is('lane', null)
      .order('createdAt', { ascending: false });
    return (data as TaskRow[]) || [];
  });
```

to:

```tsx
  const {
    data: inboxData,
    isLoading,
    mutate: mutateInbox,
  } = useSWR(
    profile ? inboxTasksQuery(profile.id).key : null,
    profile ? inboxTasksQuery(profile.id).fetcher : null
  );
```

Change:

```tsx
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
```

to:

```tsx
  const {
    data: ideaData,
    isLoading: ideasLoading,
    mutate: mutateIdeas,
  } = useSWR(
    profile ? ideasQuery(profile.id).key : null,
    profile ? ideasQuery(profile.id).fetcher : null
  );
```

Change:

```tsx
  const {
    data: ideaTaskData,
    mutate: mutateIdeaTaskCounts,
  } = useSWR(profile ? ['tasklog-idea-task-counts', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('ideaId')
      .eq('profileId', profile!.id)
      .not('ideaId', 'is', null);
    return (data as { ideaId: string }[]) || [];
  });
```

to:

```tsx
  const {
    data: ideaTaskData,
    mutate: mutateIdeaTaskCounts,
  } = useSWR(
    profile ? ideaTaskCountsQuery(profile.id).key : null,
    profile ? ideaTaskCountsQuery(profile.id).fetcher : null
  );
```

Add the import:

```tsx
import { inboxTasksQuery, ideasQuery, ideaTaskCountsQuery } from '@/lib/tasklog/queries';
```

`supabase` stays — this page's quick-add insert, idea delete, task delete/lane-move, and idea-breakdown-to-tasks insert (confirmed by the earlier research: multiple `supabase.from(...)` calls elsewhere in this file) all still call it directly.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "tasklog/plan/page"` — expect no output.
Run: `npx eslint "app/(tasklog)/tasklog/plan/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(tasklog)/tasklog/plan/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: plan page consumes shared inbox/ideas/idea-task-count registry entries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 5: Convert `goals/page.tsx` to `goalsQuery`

**Files:**
- Modify: `app/(tasklog)/tasklog/goals/page.tsx`

**Interfaces:**
- Consumes: `goalsQuery` (Task 1).

- [ ] **Step 1: Replace the inline fetcher**

Change:

```tsx
  const {
    data: goalData,
    isLoading,
    mutate: mutateGoals,
  } = useSWR(profile ? ['tasklog-goals', profile.id] : null, async () => {
    const { data } = await supabase
      .from('task_goals')
      .select('*')
      .eq('profileId', profile!.id)
      .order('createdAt', { ascending: false });
    return (data as TaskGoalRow[]) || [];
  });
```

to:

```tsx
  const {
    data: goalData,
    isLoading,
    mutate: mutateGoals,
  } = useSWR(
    profile ? goalsQuery(profile.id).key : null,
    profile ? goalsQuery(profile.id).fetcher : null
  );
```

Add the import:

```tsx
import { goalsQuery } from '@/lib/tasklog/queries';
```

Check whether `supabase`/`createClient` is still used elsewhere in this file (goal creation, e.g. `AddGoalForm`'s submit handler may live in this page or in a child component — if this page itself no longer calls `supabase.` anywhere after this change, remove the now-unused `const supabase = createClient();` and its import):

Run: `grep -n "supabase\." "app/(tasklog)/tasklog/goals/page.tsx"`

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "tasklog/goals/page"` — expect no output.
Run: `npx eslint "app/(tasklog)/tasklog/goals/page.tsx"` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(tasklog)/tasklog/goals/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: goals page consumes shared goalsQuery registry entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 6: Prefetch + preload wiring in `TaskLogBottomNav`

**Files:**
- Modify: `components/TaskLogBottomNav.tsx`

**Interfaces:**
- Consumes: `usePreloadRoutes` (existing), `useCurrentProfile()`, all six registry query factories (Task 1).

- [ ] **Step 1: Add prefetch + the preload call**

Change:

```tsx
// components/TaskLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { KanbanSquareIcon, InboxIcon, TargetIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskLogMark } from '@/components/TaskLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/tasklog', label: 'Home', Icon: null },
  { href: '/tasklog/board', label: 'Board', Icon: KanbanSquareIcon },
  { href: '/tasklog/plan', label: 'Plan', Icon: InboxIcon },
  { href: '/tasklog/goals', label: 'Goals', Icon: TargetIcon },
];

export function TaskLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/tasklog/config' || pathname.startsWith('/tasklog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/tasklog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
```

to:

```tsx
// components/TaskLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { KanbanSquareIcon, InboxIcon, TargetIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskLogMark } from '@/components/TaskLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import {
  todayTasksQuery,
  boardTasksQuery,
  inboxTasksQuery,
  ideasQuery,
  ideaTaskCountsQuery,
  goalsQuery,
} from '@/lib/tasklog/queries';

const tabs = [
  { href: '/tasklog', label: 'Home', Icon: null },
  { href: '/tasklog/board', label: 'Board', Icon: KanbanSquareIcon },
  { href: '/tasklog/plan', label: 'Plan', Icon: InboxIcon },
  { href: '/tasklog/goals', label: 'Goals', Icon: TargetIcon },
];

export function TaskLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/tasklog/config' || pathname.startsWith('/tasklog/config/');

  // Warms every nav tab's data: Home, Board, Plan (which itself needs all
  // three of inboxTasksQuery/ideasQuery/ideaTaskCountsQuery), and Goals.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [
          todayTasksQuery(profile.id),
          boardTasksQuery(profile.id),
          inboxTasksQuery(profile.id),
          ideasQuery(profile.id),
          ideaTaskCountsQuery(profile.id),
          goalsQuery(profile.id),
        ]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/tasklog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={isActive ? 'page' : undefined}
            className={cn(
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "TaskLogBottomNav"` — expect no output.
Run: `npx eslint components/TaskLogBottomNav.tsx` — expect no output.

- [ ] **Step 3: Manual verification**

Run the dev server, open the Network tab, sign in, land on `/tasklog`. Wait ~1 second, then tap "Board", "Plan", and "Goals" in sequence. Confirm: no new `tasklog_tasks`/`tasklog_ideas`/`task_goals` request fires for any of them, and all render with no loading skeleton flash.

- [ ] **Step 4: Commit**

```bash
git add components/TaskLogBottomNav.tsx
git commit -m "$(cat <<'EOF'
perf: TaskLogBottomNav prefetches tab links and preloads their data on idle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Task 7: `loading.tsx` for TaskLog + full verification pass

**Files:**
- Create: `app/(tasklog)/tasklog/loading.tsx`

- [ ] **Step 1: Write the loading UI**

```tsx
// app/(tasklog)/tasklog/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function TaskLogLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
```

Same generic shape as BurnLog's and MoneyLog's `loading.tsx`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep "tasklog/loading"` — expect no output.
Run: `npx eslint "app/(tasklog)/tasklog/loading.tsx"` — expect no output.

- [ ] **Step 3: Manual verification**

Throttle the network, hard-navigate to `/tasklog/board` via URL bar, confirm `TaskLogLoading` renders instead of a blank page.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit -p .` — expect zero errors anywhere in the repo.
Run: `npx eslint "app/(tasklog)/**/*.tsx" "lib/tasklog/**/*.ts" components/TaskLogBottomNav.tsx` — expect zero errors/warnings.
Run: `npx vitest run` — expect all tests passing (existing suite + this plan's new tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(tasklog)/tasklog/loading.tsx"
git commit -m "$(cat <<'EOF'
perf: add loading.tsx for /tasklog/* so prefetch fully warms dynamic routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VLQeMRtHqVkKtJdzSRww8Q
EOF
)"
```

---

## Plan-level self-review notes

- **Spec coverage:** all four TaskLog nav tabs converted (Tasks 2–5), prefetch + preload wiring (Task 6), `loading.tsx` (Task 7). No deep page or Server Component exclusion applies to this app — noted explicitly in "File Structure" rather than left implicit.
- **No drift bug found here, unlike the two prior plans** — stated plainly rather than manufacturing one; TaskLog's pages were already well-factored with `useCurrentProfile()` and correctly-scoped SWR keys before this plan touched them.
- **Type consistency check:** all six fetchers return exactly the types the pages already typed their `data` as before this change (`TaskRow[]`, `IdeaRow[]`, `TaskGoalRow[]`, `{ ideaId: string }[]`) — traced from each page's pre-existing `as TaskRow[]`/etc. cast, carried into the registry's fetcher return types unchanged.
