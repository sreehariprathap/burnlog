'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Trophy, UserMinus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

type Metric = 'xp' | 'streak' | 'weekly';

type LeaderboardEntry = {
  profileId: string;
  username: string;
  firstName: string;
  avatarUrl: string | null;
  level: number;
  value: number;
  rank: number;
  isSelf: boolean;
};

type Friend = {
  friendshipId: string;
  profileId: string;
  username: string;
  firstName: string;
};

const METRIC_LABEL: Record<Metric, string> = {
  xp: 'XP',
  streak: 'Streak',
  weekly: 'This Week',
};

function valueLabel(metric: Metric, value: number): string {
  if (metric === 'xp') return `${value} xp`;
  if (metric === 'streak') return `${value} day${value === 1 ? '' : 's'}`;
  return `${value}/7 days`;
}

type FriendsLeaderboardProps = {
  refreshKey: number;
};

export function FriendsLeaderboard({ refreshKey }: FriendsLeaderboardProps) {
  const [metric, setMetric] = useState<Metric>('xp');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [leaderboardRes, friendsRes] = await Promise.all([
          fetch(`/api/social/leaderboard?metric=${metric}`),
          fetch('/api/social/friends'),
        ]);
        const leaderboardData = await leaderboardRes.json();
        const friendsData = await friendsRes.json();
        if (!cancelled) {
          setEntries(leaderboardData.entries ?? []);
          setFriends(friendsData.friends ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load leaderboard',
            description: err instanceof Error ? err.message : 'Network error',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, refreshKey, manualRefreshKey]);

  const handleManualRefresh = () => setManualRefreshKey((k) => k + 1);

  const handleUnfriend = async (friendshipId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from your friends?`)) return;
    setRemovingId(friendshipId);
    try {
      const res = await fetch(`/api/social/friends/${friendshipId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove friend');
      setEntries((prev) => prev.filter((e) => e.isSelf || friends.find((f) => f.friendshipId === friendshipId)?.profileId !== e.profileId));
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
      toast({ title: 'Friend removed', description: `${name} has been removed from your friends.` });
    } catch (err) {
      toast({
        title: 'Could not remove friend',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const hasNoFriends = !loading && friends.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" /> Leaderboard
        </CardTitle>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Refresh leaderboard"
          disabled={loading}
          onClick={handleManualRefresh}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasNoFriends ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="text-3xl" role="img" aria-label="Waving hand">👋</span>
            <p className="text-sm text-muted-foreground">
              No friends yet. Search for someone to add your first friend and start competing.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                document.getElementById('friend-search-input')?.focus({ preventScroll: false })
              }
            >
              Find friends
            </Button>
          </div>
        ) : (
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList className="grid grid-cols-3">
              {(['xp', 'streak', 'weekly'] as Metric[]).map((m) => (
                <TabsTrigger key={m} value={m}>{METRIC_LABEL[m]}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={metric} className="space-y-2 pt-3">
              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center justify-between rounded-md p-2">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-20" />
                          <Skeleton className="h-3 w-14" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              ) : (
                entries.map((e) => {
                  const friend = friends.find((f) => f.profileId === e.profileId);
                  return (
                    <div
                      key={e.profileId}
                      className={cn(
                        'flex items-center justify-between rounded-md p-2',
                        e.isSelf && 'bg-primary/10'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-sm text-muted-foreground text-center">{e.rank}</span>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={e.avatarUrl ?? undefined} />
                          <AvatarFallback>{e.firstName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{e.isSelf ? 'You' : e.firstName}</p>
                          <p className="text-xs text-muted-foreground">Level {e.level}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{valueLabel(metric, e.value)}</span>
                        {!e.isSelf && friend && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${e.firstName} from friends`}
                            disabled={removingId === friend.friendshipId}
                            onClick={() => handleUnfriend(friend.friendshipId, e.firstName)}
                          >
                            {removingId === friend.friendshipId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserMinus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
