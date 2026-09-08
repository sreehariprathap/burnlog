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
import { DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('DELETE /api/adminlog/loading-animations/[id]', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), ctx('a1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when the row is read-only', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { isReadOnly: true }, error: null }),
          }),
        }),
      }),
    });
    const res = await DELETE(new Request('http://localhost'), ctx('a1'));
    expect(res.status).toBe(400);
  });

  it('deletes a non-read-only row', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { isReadOnly: false }, error: null }),
          }),
        }),
        delete: () => ({ eq: deleteEq }),
      }),
    });
    const res = await DELETE(new Request('http://localhost'), ctx('a1'));
    expect(res.status).toBe(200);
    expect(deleteEq).toHaveBeenCalledWith('id', 'a1');
  });
});
