// app/(watchlog)/watchlog/_components/StatsContent.tsx
'use client';

import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { watchItemsQuery } from '@/lib/watchlog/queries';
import { computeWatchStats } from '@/lib/watchlog/stats';

export function StatsContent() {
  const { profile } = useCurrentProfile();
  const query = profile ? watchItemsQuery(profile.id) : null;
  const { data, isLoading } = useSWR(query?.key ?? null, query?.fetcher ?? null);

  const stats = computeWatchStats(data ?? []);
  const topGenres = Object.entries(stats.genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Stats" />
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatCard className="text-center">
                <p className="text-2xl font-bold tabular-nums">{stats.completedCount}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </StatCard>
              <StatCard className="text-center">
                <p className="text-2xl font-bold tabular-nums">{stats.hoursWatched.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Hours watched</p>
              </StatCard>
              <StatCard className="text-center">
                <p className="text-2xl font-bold tabular-nums">{stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}</p>
                <p className="text-xs text-muted-foreground">Avg rating</p>
              </StatCard>
            </div>
            {topGenres.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Top genres</p>
                <div className="space-y-1">
                  {topGenres.map(([genre, count]) => (
                    <div key={genre} className="flex justify-between text-sm">
                      <span>{genre}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
