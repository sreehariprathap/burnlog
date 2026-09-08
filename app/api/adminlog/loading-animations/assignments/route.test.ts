import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/adminlog/testOnboarding', () => ({
  requireAdminCaller: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { PUT } from './route';

describe('PUT /api/adminlog/loading-animations/assignments', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ appId: 'burnlog', animationId: 'a1' }) });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('rejects a missing appId', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ animationId: 'a1' }) });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('upserts the assignment, allowing a null animationId', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ upsert }),
    });
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ appId: 'homelog', animationId: null }) });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'homelog', animationId: null, updatedByAdminId: 'p1' }),
      { onConflict: 'appId' }
    );
  });
});
