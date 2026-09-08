import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { GET } from './route';

function fakeAuthedSupabase(user: { id: string } | null) {
  return { auth: { getUser: () => Promise.resolve({ data: { user } }) } };
}

function fakeServiceRole(row: { data: unknown } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    }),
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/loading-animations/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase(null));
    const res = await GET(new Request('http://localhost/api/loading-animations/x'), ctx('x'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the row has no data (e.g. missing or a siri_orb row)', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeServiceRole(null));
    const res = await GET(new Request('http://localhost/api/loading-animations/x'), ctx('x'));
    expect(res.status).toBe(404);
  });

  it('streams the animation JSON with the right content type', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeServiceRole({ data: { v: '5.9.6', layers: [] } })
    );
    const res = await GET(new Request('http://localhost/api/loading-animations/a1'), ctx('a1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(body).toEqual({ v: '5.9.6', layers: [] });
  });
});
