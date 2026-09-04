// lib/watchlog/stats.ts
import type { WatchItemRow } from './types';

export interface WatchStats {
  completedCount: number;
  hoursWatched: number;
  averageRating: number;
  genreCounts: Record<string, number>;
}

export function computeWatchStats(items: WatchItemRow[]): WatchStats {
  const completed = items.filter((i) => i.status === 'completed');
  const totalMinutes = completed.reduce((sum, i) => sum + (i.runtimeMinutes ?? 0), 0);
  const rated = completed.filter((i) => typeof i.rating === 'number');
  const averageRating = rated.length > 0
    ? rated.reduce((sum, i) => sum + (i.rating ?? 0), 0) / rated.length
    : 0;

  const genreCounts: Record<string, number> = {};
  for (const item of items) {
    for (const genre of item.genres) {
      genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
    }
  }

  return {
    completedCount: completed.length,
    hoursWatched: totalMinutes / 60,
    averageRating,
    genreCounts,
  };
}
