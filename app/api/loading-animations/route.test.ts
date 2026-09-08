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

// Real Supabase query builders resolve when awaited directly (they
// implement PromiseLike), so `.select()` here returns an already-resolved
// Promise rather than a further chainable object — this route does no
// `.eq()`/filtering on the assignments query, just a plain select.
function fakeServiceRole(assignmentRows: Array<{ appId: string; animationId: string | null; adminlog_lottie_animations: { id: string; kind: string; filePath: string | null } | null }>) {
  return {
    from: (_table: string) => ({
      select: () => Promise.resolve({ data: assignmentRows, error: null }),
    }),
  };
}

describe('GET /api/loading-animations', () => {
  it('returns 401 when unauthenticated', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase(null));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('resolves a file-backed animation to its static path', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeServiceRole([
        { appId: 'burnlog', animationId: 'a1', adminlog_lottie_animations: { id: 'a1', kind: 'lottie', filePath: '/lottie/burnlog.json' } },
      ])
    );
    const res = await GET();
    const body = await res.json();
    expect(body.animations.burnlog).toEqual({ src: '/lottie/burnlog.json', kind: 'lottie' });
  });

  it('resolves a DB-stored animation to the by-id route, and siri_orb to a null src', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeServiceRole([
        { appId: 'watchlog', animationId: 'a2', adminlog_lottie_animations: { id: 'a2', kind: 'lottie', filePath: null } },
        { appId: 'intellog', animationId: 'a3', adminlog_lottie_animations: { id: 'a3', kind: 'siri_orb', filePath: null } },
        { appId: 'homelog', animationId: null, adminlog_lottie_animations: null },
      ])
    );
    const res = await GET();
    const body = await res.json();
    expect(body.animations.watchlog).toEqual({ src: '/api/loading-animations/a2', kind: 'lottie' });
    expect(body.animations.intellog).toEqual({ src: null, kind: 'siri_orb' });
    expect(body.animations.homelog).toBeNull();
  });
});
