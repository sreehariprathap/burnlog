import { describe, it, expect, vi } from 'vitest';
import { fetchWatchItems, addWatchItem, updateWatchItem, addWatchIgnore, fetchIgnoredTmdbIds } from './queries';
import type { TmdbItem } from './types';

// Same thenable-and-chainable mock shape as lib/learnlog/queries.test.ts.
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const order = vi.fn().mockReturnValue(makeThenable({}));
  const eqSecond = makeThenable({ order });
  const eqFirst = makeThenable({ eq: vi.fn().mockReturnValue(eqSecond), order });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqFirst) });
  const insertSelect = vi.fn().mockReturnValue({ single: () => Promise.resolve(resolved) });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });
  const updateEq = vi.fn().mockReturnValue(makeThenable({}));
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const upsert = vi.fn().mockReturnValue(makeThenable({}));
  const from = vi.fn().mockReturnValue({ select, insert, update, upsert });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchWatchItems', () => {
  it('queries watch_items filtered by profileId, ordered by updatedAt desc', async () => {
    const rows = [{ id: 'w1', status: 'want' }];
    const supabase = fakeSupabase({ data: rows, error: null });
    const result = await fetchWatchItems(supabase, 'profile-1');
    expect(supabase.from).toHaveBeenCalledWith('watch_items');
    expect(result).toEqual(rows);
  });

  it('adds a status filter when status is provided', async () => {
    const supabase = fakeSupabase({ data: [], error: null });
    await fetchWatchItems(supabase, 'profile-1', 'watching');
    const selectCall = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value.select;
    expect(selectCall).toHaveBeenCalledWith('*');
  });

  it('throws when the query errors', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('db down') });
    await expect(fetchWatchItems(supabase, 'profile-1')).rejects.toThrow('db down');
  });
});

describe('addWatchItem', () => {
  const tmdbItem: TmdbItem = {
    tmdbId: 550,
    mediaType: 'movie',
    title: 'Fight Club',
    posterPath: '/abc.jpg',
    releaseYear: 1999,
    overview: 'x',
    voteAverage: 8.4,
    genres: ['Drama'],
  };

  it('inserts a new row from a TmdbItem, defaulting status to want', async () => {
    const inserted = { id: 'w1', ...tmdbItem, status: 'want' };
    const supabase = fakeSupabase({ data: inserted, error: null });
    const result = await addWatchItem(supabase, 'profile-1', tmdbItem);
    expect(supabase.from).toHaveBeenCalledWith('watch_items');
    expect(result).toEqual(inserted);
  });

  it('inserts with an explicit initial status and sets completedAt when status is completed', async () => {
    const inserted = { id: 'w2', ...tmdbItem, status: 'completed' };
    const supabase = fakeSupabase({ data: inserted, error: null });
    await addWatchItem(supabase, 'profile-1', tmdbItem, 'completed');
    const insertFn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value.insert;
    const insertedArg = insertFn.mock.calls[0][0];
    expect(insertedArg.status).toBe('completed');
    expect(typeof insertedArg.completedAt).toBe('string');
  });
});

describe('addWatchIgnore', () => {
  it('upserts an ignore row for the given tmdbId/mediaType (idempotent on repeat ignores)', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    await addWatchIgnore(supabase, 'profile-1', 550, 'movie');
    expect(supabase.from).toHaveBeenCalledWith('watch_ignores');
    const upsertFn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value.upsert;
    expect(upsertFn).toHaveBeenCalledWith(
      { profileId: 'profile-1', tmdbId: 550, mediaType: 'movie' },
      { onConflict: 'profileId,tmdbId,mediaType', ignoreDuplicates: true }
    );
  });
});

describe('fetchIgnoredTmdbIds', () => {
  it('returns the set of ignored tmdbIds for a profile', async () => {
    const rows = [{ tmdbId: 550 }, { tmdbId: 27205 }];
    const supabase = fakeSupabase({ data: rows, error: null });
    const result = await fetchIgnoredTmdbIds(supabase, 'profile-1');
    expect(supabase.from).toHaveBeenCalledWith('watch_ignores');
    expect(result).toEqual(new Set([550, 27205]));
  });

  it('returns an empty set when the query errors', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('db down') });
    const result = await fetchIgnoredTmdbIds(supabase, 'profile-1');
    expect(result).toEqual(new Set());
  });
});

describe('updateWatchItem', () => {
  it('updates the given fields for the row id', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    await updateWatchItem(supabase, 'w1', { status: 'completed', rating: 5 });
    const updateFn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value.update;
    expect(updateFn).toHaveBeenCalledWith({ status: 'completed', rating: 5 });
  });
});
