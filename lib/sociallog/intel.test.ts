import { describe, it, expect, vi } from 'vitest';
import { extractSociallogSnapshot } from './intel';

function fakeSupabase(postRows: unknown[], friendRows: unknown[]) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'social_posts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ data: postRows, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: friendRows, error: null }),
          }),
        }),
      };
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('extractSociallogSnapshot', () => {
  it('reports postsPerWeek and friendCount', async () => {
    const supabase = fakeSupabase([{}, {}, {}], [{}, {}]);
    const metrics = await extractSociallogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ postsPerWeek: 3, friendCount: 2 });
  });

  it('returns zeros when there is no activity', async () => {
    const supabase = fakeSupabase([], []);
    const metrics = await extractSociallogSnapshot(supabase, 'profile-1', '2026-09-02');
    expect(metrics).toEqual({ postsPerWeek: 0, friendCount: 0 });
  });
});
