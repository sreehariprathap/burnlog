import { describe, it, expect } from 'vitest';
import { computeWatchStats } from './stats';
import type { WatchItemRow } from './types';

function item(overrides: Partial<WatchItemRow>): WatchItemRow {
  return {
    id: 'w1', profileId: 'p1', tmdbId: 1, mediaType: 'movie', title: 'X',
    posterPath: null, releaseYear: 2020, runtimeMinutes: 120, genres: ['Drama'],
    tags: [], status: 'completed', rating: 4, currentSeason: null, currentEpisode: null,
    notes: null, addedAt: '2026-01-01', completedAt: '2026-01-02', updatedAt: '2026-01-02',
    ...overrides,
  };
}

describe('computeWatchStats', () => {
  it('counts completed items and sums runtime minutes into hours', () => {
    const items = [item({ runtimeMinutes: 120 }), item({ id: 'w2', runtimeMinutes: 90 })];
    const stats = computeWatchStats(items);
    expect(stats.completedCount).toBe(2);
    expect(stats.hoursWatched).toBeCloseTo(3.5, 1);
  });

  it('ignores non-completed items for hoursWatched and completedCount', () => {
    const items = [item({ status: 'want', runtimeMinutes: 500 })];
    const stats = computeWatchStats(items);
    expect(stats.completedCount).toBe(0);
    expect(stats.hoursWatched).toBe(0);
  });

  it('computes average rating across rated completed items', () => {
    const items = [item({ rating: 5 }), item({ id: 'w2', rating: 3 })];
    expect(computeWatchStats(items).averageRating).toBeCloseTo(4, 1);
  });

  it('counts genre frequency across all items regardless of status', () => {
    const items = [
      item({ genres: ['Drama', 'Comedy'] }),
      item({ id: 'w2', status: 'want', genres: ['Drama'] }),
    ];
    expect(computeWatchStats(items).genreCounts).toEqual({ Drama: 2, Comedy: 1 });
  });

  it('returns zeroed stats for an empty list', () => {
    expect(computeWatchStats([])).toEqual({
      completedCount: 0, hoursWatched: 0, averageRating: 0, genreCounts: {},
    });
  });
});
