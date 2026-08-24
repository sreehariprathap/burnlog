'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trophy, UserMinus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metric, refreshKey]);

  const handleUnfriend = async (friendshipId: string) => {
    setRemovingId(friendshipId);
    try {
      await fetch(`/api/social/friends/${friendshipId}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.isSelf || friends.find((f) => f.friendshipId === friendshipId)?.profileId !== e.profileId));
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    } finally {
      setRemovingId(null);
    }
  };

  const hasNoFriends = !loading && friends.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" /> Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasNoFriends ? (
          <p className="text-sm text-muted-foreground">
            No friends yet — search above to add someone.
          </p>
        ) : (
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList className="grid grid-cols-3">
              {(['xp', 'streak', 'weekly'] as Metric[]).map((m) => (
                <TabsTrigger key={m} value={m}>{METRIC_LABEL[m]}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={metric} className="space-y-2 pt-3">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
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
                            disabled={removingId === friend.friendshipId}
                            onClick={() => handleUnfriend(friend.friendshipId)}
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
