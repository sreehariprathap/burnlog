// components/learnlog/GroupInvitesBanner.tsx
'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

interface GroupInvite {
  id: string;
  groupName: string;
  entityType: string;
  invitedByUsername: string;
}

async function fetchInvites(): Promise<GroupInvite[]> {
  const res = await apiFetch('/api/learnlog/invites');
  if (!res.ok) throw new Error('Failed to load group invites');
  const body = await res.json();
  return body.invites ?? [];
}

export function GroupInvitesBanner() {
  const { data: invites, mutate } = useSWR('learnlog-group-invites', fetchInvites);
  const { toast } = useToast();

  async function respond(id: string, action: 'accept' | 'decline') {
    const res = await apiFetch(`/api/learnlog/invites/${id}/${action}`, { method: 'POST' });
    if (res.ok) {
      await mutate();
      toast({ title: action === 'accept' ? 'Group invite accepted' : 'Group invite declined' });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: 'Could not respond', description: body.error, variant: 'destructive' });
    }
  }

  if (!invites || invites.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Learning group invites</p>
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-2">
            <p className="text-sm truncate">@{inv.invitedByUsername} invited you to &quot;{inv.groupName}&quot;</p>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => respond(inv.id, 'decline')}>Decline</Button>
              <Button size="sm" onClick={() => respond(inv.id, 'accept')}>Accept</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
