// app/(sociallog)/sociallog/search/_components/UserResults.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

type UserResult = { id: string; username: string; firstName: string; avatarUrl: string | null; isFollowing: boolean };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

function FollowButton({ userId, initialFollowing }: { userId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    if (following) {
      const res = await apiFetch(`/api/sociallog/follow/${userId}`, { method: 'DELETE' });
      if (res.ok) setFollowing(false);
    } else {
      const res = await apiFetch('/api/sociallog/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: userId }),
      });
      if (res.ok) setFollowing(true);
    }
    setBusy(false);
  };

  return (
    <Button variant={following ? 'outline' : 'default'} size="sm" onClick={toggle} disabled={busy}>
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}

export function UserResults({ query }: { query: string }) {
  const { data, isLoading } = useSWR<{ results: UserResult[] }>(
    `/api/sociallog/search/users?q=${encodeURIComponent(query)}`,
    fetcher
  );

  if (query.trim().length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search users.</p>;
  }
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if ((data?.results.length ?? 0) === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>;
  }

  return (
    <div className="space-y-2">
      {data!.results.map((u) => (
        <div key={u.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Avatar>
              {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
              <AvatarFallback>{u.firstName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">@{u.username}</p>
              <p className="text-xs text-muted-foreground">{u.firstName}</p>
            </div>
          </div>
          <FollowButton userId={u.id} initialFollowing={u.isFollowing} />
        </div>
      ))}
    </div>
  );
}
