import { describe, it, expect, vi } from 'vitest';
import { extractBurnlogSnapshot } from './intel';

function fakeSupabase(sessions: { sessionData: { completed?: boolean } }[], calorieBurns: { caloriesBurned: number }[]) {
  const from = vi.fn((table: string) => {
    const rows = table === 'sessions' ? sessions : calorieBurns;
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    };
  });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('extractBurnlogSnapshot', () => {
  it('counts completed sessions in the trailing 7 days as workoutsPerWeek, and sums calorie_burns', async () => {
    const supabase = fakeSupabase(
      [
        { sessionData: { completed: true } },
        { sessionData: { completed: true } },
        { sessionData: { completed: false } },
      ],
      [{ caloriesBurned: 200 }, { caloriesBurned: 150 }]
    );
    const metrics = await extractBurnlogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ workoutsPerWeek: 2, caloriesBurnedPerWeek: 350 });
  });

  it('returns zeros when there are no rows', async () => {
    const supabase = fakeSupabase([], []);
    const metrics = await extractBurnlogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ workoutsPerWeek: 0, caloriesBurnedPerWeek: 0 });
  });
});
