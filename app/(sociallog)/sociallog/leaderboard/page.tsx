// app/(sociallog)/sociallog/leaderboard/page.tsx
'use client';

import useSWR from 'swr';
import { TrophyIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  profileId: string;
  username: string;
  firstName: string;
  avatarUrl: string | null;
  score: number | null;
  isMe: boolean;
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load leaderboard');
  const json = await res.json();
  return json.entries as LeaderboardEntry[];
}

export default function LeaderboardPage() {
  const { data, isLoading } = useSWR('/api/sociallog/leaderboard', fetcher);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Life Score Leaderboard" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-3 p-4 pb-24">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        )}

        {!isLoading && data && data.length <= 1 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <TrophyIcon className="h-8 w-8" />
              <p>Follow friends who follow you back to see them on the leaderboard.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && data && data.length > 1 && (
          <div className="space-y-2">
            {data.map((entry, i) => (
              <Card key={entry.profileId} className={cn(entry.isMe && 'border-primary')}>
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {entry.firstName} {entry.isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">@{entry.username}</p>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{entry.score ?? '—'}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
