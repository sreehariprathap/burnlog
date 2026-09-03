// lib/logbook/queries.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchToday, fetchMyDay, todayQuery, todayKey, myDayQuery } from './queries';

function stubFetchOnce(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchToday', () => {
  it('returns the parsed logbook-today payload on success', async () => {
    const payload = { dayScore: 82, yesterdayScore: 75, lifeScoreMode: 'engagement' };
    stubFetchOnce(payload);
    const result = await fetchToday();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'server error' }) }));
    await expect(fetchToday()).rejects.toThrow('Failed to load logbook data');
  });
});

describe('fetchMyDay', () => {
  it('returns the parsed MyDay payload for the given date', async () => {
    const payload = { date: '2026-09-03', blocks: [], unscheduled: [] };
    stubFetchOnce(payload);
    const result = await fetchMyDay('2026-09-03');
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'server error' }) }));
    await expect(fetchMyDay('2026-09-03')).rejects.toThrow('Failed to load MyDay');
  });
});

describe('todayKey', () => {
  it('formats the current date as yyyy-MM-dd', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('registry key shapes', () => {
  it('todayQuery keys by a plain resource-name string', () => {
    expect(todayQuery().key).toBe('logbook-today');
  });

  it('myDayQuery keys by the date it was called with', () => {
    expect(myDayQuery('2026-09-03').key).toBe('myday-2026-09-03');
  });
});
