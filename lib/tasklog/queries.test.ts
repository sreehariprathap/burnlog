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
