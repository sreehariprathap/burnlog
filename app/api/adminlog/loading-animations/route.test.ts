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
import { GET, POST } from './route';

const VALID_LOTTIE = { v: '5.9.6', layers: [{ ty: 4 }] };

describe('GET /api/adminlog/loading-animations', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('lists animations without their data, plus assignments', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: (table: string) => {
        if (table === 'adminlog_lottie_animations') {
          return {
            select: () => Promise.resolve({
              data: [
                { id: 'a1', name: 'Weightlifting', kind: 'lottie', isReadOnly: true, filePath: '/lottie/burnlog.json', data: null },
                { id: 'a2', name: 'Custom', kind: 'lottie', isReadOnly: false, filePath: null, data: VALID_LOTTIE },
              ],
              error: null,
            }),
          };
        }
        return {
          select: () => Promise.resolve({
            data: [{ appId: 'burnlog', animationId: 'a1' }, { appId: 'homelog', animationId: null }],
            error: null,
          }),
        };
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(body.animations).toEqual([
      { id: 'a1', name: 'Weightlifting', kind: 'lottie', isReadOnly: true, filePath: '/lottie/burnlog.json', hasData: false },
      { id: 'a2', name: 'Custom', kind: 'lottie', isReadOnly: false, filePath: null, hasData: true },
    ]);
    expect(body.assignments).toEqual({ burnlog: 'a1', homelog: null });
  });
});

describe('POST /api/adminlog/loading-animations', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'x', data: VALID_LOTTIE }) });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects a blank name', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: '  ', data: VALID_LOTTIE }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects data with no layers array', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'x', data: { v: '1' } }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects an oversized payload', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const huge = { v: '1', layers: [], padding: 'x'.repeat(3 * 1024 * 1024) };
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'x', data: huge }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('creates a non-read-only lottie animation on valid input', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { id: 'new-id', name: row.name, kind: row.kind, isReadOnly: row.isReadOnly, filePath: null, data: row.data },
              error: null,
            }),
          }),
        }),
      }),
    });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'My animation', data: VALID_LOTTIE }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.animation).toEqual({ id: 'new-id', name: 'My animation', kind: 'lottie', isReadOnly: false, filePath: null, hasData: true });
  });
});
