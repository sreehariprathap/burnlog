// lib/sociallog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// Both fetchers call apiFetch (lib/apiFetch.ts), which transitively
// imports components/ui/use-toast.tsx for its error-toast side effect — a
// real .tsx file this repo's Vitest setup has never needed to transform.
// Mocking the module before `./queries` imports it keeps that file out of
// the test's module graph entirely (same fix as the MoneyLog/TravelLog/
// ShoppingLog registry tests).
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const { fetchStats, fetchThreads, statsQuery, threadsQuery } = await import('./queries');

describe('fetchStats', () => {
  it('returns the parsed stats payload on success', async () => {
    const payload = { followers: 42, posts: 7 };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchStats();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchStats()).rejects.toThrow('Failed to load feed');
  });
});

describe('fetchThreads', () => {
  it('returns the parsed threads payload on success', async () => {
    const payload = {
      threads: [
        {
          id: 't1',
          otherParticipant: { id: 'p1', username: 'sam', firstName: 'Sam', avatarUrl: null },
          lastMessageAt: '2026-09-01T00:00:00Z',
          lastMessageBody: 'hey!',
        },
      ],
    };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchThreads();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchThreads()).rejects.toThrow('Failed to load threads');
  });
});

describe('registry key shapes', () => {
  it('statsQuery keys by the API route path', () => {
    expect(statsQuery().key).toBe('/api/sociallog/stats');
  });

  it('threadsQuery keys by the API route path', () => {
    expect(threadsQuery().key).toBe('/api/sociallog/messages/threads');
  });
});
