// app/(sociallog)/sociallog/search/_components/UserResults.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, Search, UserX } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

type RequestStatus = 'none' | 'pending' | 'accepted';
type UserResult = { id: string; username: string; firstName: string; avatarUrl: string | null; isPrivate: boolean; requestStatus: RequestStatus };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

function FollowButton({ userId, initialStatus }: { userId: string; initialStatus: RequestStatus }) {
  const [status, setStatus] = useState<RequestStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const toggle = async () => {
    setBusy(true);
    if (status === 'accepted') {
      const res = await apiFetch(`/api/sociallog/follow/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setStatus('none');
        toast({ title: 'Unfollowed' });
      }
    } else if (status === 'pending') {
      const res = await apiFetch(`/api/sociallog/follow/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setStatus('none');
        toast({ title: 'Request canceled' });
      }
    } else {
      const res = await apiFetch('/api/sociallog/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: userId }),
      });
      if (res.ok) {
        const body = await res.json();
        setStatus(body.status === 'pending' ? 'pending' : 'accepted');
        toast({ title: body.status === 'pending' ? 'Request sent' : 'Followed' });
      }
    }
    setBusy(false);
  };

  const label = status === 'accepted' ? 'Following' : status === 'pending' ? 'Requested' : 'Follow';

  return (
    <Button variant={status === 'none' ? 'default' : 'outline'} size="sm" onClick={toggle} disabled={busy}>
      {label}
    </Button>
  );
}

export function UserResults({ query }: { query: string }) {
  const { data, isLoading } = useSWR<{ results: UserResult[] }>(
    `/api/sociallog/search/users?q=${encodeURIComponent(query)}`,
    fetcher
  );

  if (query.trim().length < 2) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Search className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Type at least 2 characters to search users.</p>
      </div>
    );
  }
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if ((data?.results.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <UserX className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No users found.</p>
      </div>
    );
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
          <FollowButton userId={u.id} initialStatus={u.requestStatus} />
        </div>
      ))}
    </div>
  );
}
