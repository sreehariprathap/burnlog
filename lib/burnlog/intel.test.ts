import { describe, it, expect, vi } from 'vitest';
import { extractBurnlogSnapshot } from './intel';

function fakeSupabase(rows: { bodyPart: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('extractBurnlogSnapshot', () => {
  it('counts non-Rest workouts in the trailing 7 days as workoutsPerWeek', async () => {
    const supabase = fakeSupabase([
      { bodyPart: 'Push' },
      { bodyPart: 'Pull' },
      { bodyPart: 'Rest' },
      { bodyPart: 'Legs' },
    ]);
    const metrics = await extractBurnlogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ workoutsPerWeek: 3 });
  });

  it('returns workoutsPerWeek: 0 when there are no rows', async () => {
    const supabase = fakeSupabase([]);
    const metrics = await extractBurnlogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ workoutsPerWeek: 0 });
  });
});
