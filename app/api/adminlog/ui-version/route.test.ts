import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/adminlog/testOnboarding', () => ({
  requireAdminCaller: vi.fn(),
}));

import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { createClient } from '@/lib/supabase/server';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { GET, PUT } from './route';

function fakeSelect(row: { id: string; enabled: boolean } | null) {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: row ? [row] : [], error: null }),
    }),
  };
}

function fakeUpsert() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { client: { from: () => ({ upsert }) }, upsert };
}

describe('GET /api/adminlog/ui-version', () => {
  it('returns enabled:false when no row exists', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeSelect(null));
    const res = await GET();
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });

  it('returns enabled:true when the global row has enabled:true', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeSelect({ id: 'global', enabled: true })
    );
    const res = await GET();
    const body = await res.json();
    expect(body.enabled).toBe(true);
  });
});

describe('PUT /api/adminlog/ui-version', () => {
  it('rejects a non-admin caller', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost/api/adminlog/ui-version', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('upserts the global row for an admin caller', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'admin-1' });
    const { client, upsert } = fakeUpsert();
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);
    const req = new Request('http://localhost/api/adminlog/ui-version', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PUT(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'global', enabled: true }),
      { onConflict: 'id' }
    );
  });
});
