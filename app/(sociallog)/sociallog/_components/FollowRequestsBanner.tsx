// app/(sociallog)/sociallog/_components/FollowRequestsBanner.tsx
'use client';

import useSWR from 'swr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

interface FollowRequest {
  id: string;
  createdAt: string;
  requester: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
}

async function fetchRequests(): Promise<FollowRequest[]> {
  const res = await apiFetch('/api/sociallog/follow-requests');
  if (!res.ok) throw new Error('Failed to load follow requests');
  const body = await res.json();
  return body.requests ?? [];
}

export function FollowRequestsBanner() {
  const { data: requests, mutate } = useSWR('sociallog-follow-requests', fetchRequests);
  const { toast } = useToast();

  async function respond(id: string, action: 'accept' | 'decline') {
    const res = await apiFetch(`/api/sociallog/follow-requests/${id}/${action}`, { method: 'POST' });
    if (res.ok) {
      await mutate();
      toast({ title: action === 'accept' ? 'Follow request accepted' : 'Follow request declined' });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: 'Could not respond', description: body.error, variant: 'destructive' });
    }
  }

  if (!requests || requests.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Follow requests</p>
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8">
                {r.requester?.avatarUrl && <AvatarImage src={r.requester.avatarUrl} alt={r.requester.username} />}
                <AvatarFallback>{r.requester?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="text-sm truncate">@{r.requester?.username ?? 'unknown'}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => respond(r.id, 'decline')}>Decline</Button>
              <Button size="sm" onClick={() => respond(r.id, 'accept')}>Accept</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
