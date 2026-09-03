import { describe, it, expect, vi } from 'vitest';
import { extractTasklogSnapshot } from './intel';

function fakeSupabase(rows: { completedAt: string | null }[]) {
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

describe('extractTasklogSnapshot', () => {
  it('computes completionRate over tasks due in the trailing 7 days', async () => {
    const supabase = fakeSupabase([
      { completedAt: '2026-09-01T00:00:00Z' },
      { completedAt: null },
      { completedAt: '2026-09-02T00:00:00Z' },
      { completedAt: null },
    ]);
    const metrics = await extractTasklogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ completionRate: 50 });
  });

  it('returns completionRate: 0 when there are no rows', async () => {
    const supabase = fakeSupabase([]);
    const metrics = await extractTasklogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ completionRate: 0 });
  });
});
