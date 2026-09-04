import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { GET } from './route';

function fakeSupabase(existingRow: { id: string } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: existingRow, error: null }),
        }),
      }),
    }),
  };
}

describe('GET /api/username-available', () => {
  it('rejects an invalid username shape without querying the database', async () => {
    const req = new Request('http://localhost/api/username-available?u=a');
    const res = await GET(req);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/3-20/);
  });

  it('returns available:true when no row exists', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeSupabase(null));
    const req = new Request('http://localhost/api/username-available?u=validname');
    const res = await GET(req);
    const body = await res.json();
    expect(body.available).toBe(true);
  });

  it('returns available:false when a row already exists', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeSupabase({ id: 'x' }));
    const req = new Request('http://localhost/api/username-available?u=taken');
    const res = await GET(req);
    const body = await res.json();
    expect(body.available).toBe(false);
  });
});
