import { describe, it, expect, vi } from 'vitest';
import { extractMoneylogSnapshot } from './intel';

function fakeSupabase(goalRows: { category: string; targetValue: number }[], txRows: { category: string; amount: number }[]) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'financial_goals') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: goalRows, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ data: txRows, error: null }),
            }),
          }),
        }),
      };
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('extractMoneylogSnapshot', () => {
  it('computes budgetPct as month-to-date spend vs the sum of spending_cap targets', async () => {
    const supabase = fakeSupabase(
      [{ category: 'dining', targetValue: 200 }, { category: 'groceries', targetValue: 300 }],
      [{ category: 'dining', amount: 100 }, { category: 'groceries', amount: 150 }]
    );
    const metrics = await extractMoneylogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ budgetPct: 50 });
  });

  it('omits budgetPct when the profile has no spending_cap goals', async () => {
    const supabase = fakeSupabase([], []);
    const metrics = await extractMoneylogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({});
  });
});
