// lib/burnlog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  fetchFitnessGoals,
  fetchWorkoutPlan,
  fetchDateSession,
  fitnessGoalsQuery,
  workoutPlanQuery,
  dateSessionQuery,
} from './queries';

// Real Supabase query builders are thenable at every step (so a query can be
// awaited directly, like fetchFitnessGoals' single `.eq()` with no
// `.single()`) while also being chainable further (like fetchWorkoutPlan's
// two `.eq()` calls before `.single()`). This mock matches that shape.
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const eqSecond = makeThenable({
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
  });
  const eqFirst = makeThenable({
    eq: vi.fn().mockReturnValue(eqSecond),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
  });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqFirst) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchFitnessGoals', () => {
  it('returns the profile\'s fitness goals', async () => {
    const goals = [{ id: 'g1', goalType: 'weight_loss', targetValue: 70 }];
    const supabase = fakeSupabase({ data: goals, error: null });
    const result = await fetchFitnessGoals(supabase, 'profile-1');
    expect(result).toEqual(goals);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchFitnessGoals(supabase, 'profile-1')).rejects.toThrow('boom');
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchFitnessGoals(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchWorkoutPlan', () => {
  it('maps a found row to a WorkoutPlanDay', async () => {
    const supabase = fakeSupabase({
      data: { dayOfWeek: 2, bodyPart: 'Push', repeatWeekly: true },
      error: null,
    });
    const result = await fetchWorkoutPlan(supabase, 'profile-1', 2);
    expect(result).toEqual({ dayIndex: 2, bodyPart: 'Push', repeatWeekly: true });
  });

  it('returns null when no plan exists for that day', async () => {
    const supabase = fakeSupabase({ data: null, error: { code: 'PGRST116' } });
    const result = await fetchWorkoutPlan(supabase, 'profile-1', 2);
    expect(result).toBeNull();
  });
});

describe('fetchDateSession', () => {
  it('returns the sessionData for a logged session', async () => {
    const sessionData = { completed: true, bodyPart: 'Legs' };
    const supabase = fakeSupabase({ data: { sessionData }, error: null });
    const result = await fetchDateSession(supabase, 'profile-1', '2026-09-01');
    expect(result).toEqual(sessionData);
  });

  it('returns null when no session was logged that day', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchDateSession(supabase, 'profile-1', '2026-09-01');
    expect(result).toBeNull();
  });
});

describe('registry key shapes', () => {
  it('fitnessGoalsQuery keys by app+resource+profileId', () => {
    expect(fitnessGoalsQuery('profile-1').key).toEqual(['burnlog-fitness-goals', 'profile-1']);
  });

  it('workoutPlanQuery keys by app+resource+profileId+day', () => {
    expect(workoutPlanQuery('profile-1', 3).key).toEqual(['burnlog-workout-plan', 'profile-1', 3]);
  });

  it('dateSessionQuery keys by app+resource+profileId+date', () => {
    expect(dateSessionQuery('profile-1', '2026-09-01').key).toEqual([
      'burnlog-date-session',
      'profile-1',
      '2026-09-01',
    ]);
  });
});
