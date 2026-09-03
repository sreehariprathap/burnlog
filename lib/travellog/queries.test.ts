// lib/travellog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// fetchTrips calls apiFetch (lib/apiFetch.ts), which transitively imports
// components/ui/use-toast.tsx for its error-toast side effect — a real
// .tsx file this repo's Vitest setup has never needed to transform.
// Mocking the module before `./queries` imports it keeps that file out of
// the test's module graph entirely (same fix as lib/moneylog/queries.test.ts).
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const { fetchVisits, fetchTrips, fetchWeeklySuggestions, visitsQuery, tripsQuery, weeklySuggestionsQuery } =
  await import('./queries');

// Same thenable-and-chainable mock shape as the other three registries.
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const order = vi.fn().mockReturnValue(makeThenable({}));
  const eqChain = makeThenable({ order });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqChain) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchVisits', () => {
  it('returns the profile\'s visits ordered by arrival date', async () => {
    const visits = [{ id: 'v1', placeName: 'Lisbon', country: 'Portugal', arrivalDate: '2026-05-01' }];
    const supabase = fakeSupabase({ data: visits, error: null });
    const result = await fetchVisits(supabase, 'profile-1');
    expect(result).toEqual(visits);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchVisits(supabase, 'profile-1')).rejects.toThrow('boom');
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchVisits(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchTrips', () => {
  it('returns the parsed trips payload on success', async () => {
    const payload = { plans: [{ id: 'p1', destination: 'Tokyo', startDate: '2026-10-01', endDate: '2026-10-10', status: 'planned', myRole: 'owner' }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchTrips();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchTrips()).rejects.toThrow('Failed to load trips');
  });
});

describe('fetchWeeklySuggestions', () => {
  it('returns the profile\'s weekly trip suggestions', async () => {
    const suggestions = [{ id: 's1', destination: 'Kyoto', country: 'Japan', startDate: '2026-09-10', endDate: '2026-09-12', windowLabel: 'This weekend', reason: 'Free days + good weather' }];
    const supabase = fakeSupabase({ data: suggestions, error: null });
    const result = await fetchWeeklySuggestions(supabase, 'profile-1');
    expect(result).toEqual(suggestions);
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchWeeklySuggestions(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('registry key shapes', () => {
  it('visitsQuery keys by app+resource+profileId', () => {
    expect(visitsQuery('profile-1').key).toEqual(['travellog-visits', 'profile-1']);
  });

  it('tripsQuery keys by the API route path (session-scoped server-side)', () => {
    expect(tripsQuery().key).toBe('/api/travellog/plans');
  });

  it('weeklySuggestionsQuery keys by app+resource+profileId', () => {
    expect(weeklySuggestionsQuery('profile-1').key).toEqual(['travellog-weekly-suggestions', 'profile-1']);
  });
});
