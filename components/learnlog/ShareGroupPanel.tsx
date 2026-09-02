// components/learnlog/ShareGroupPanel.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { UsernameSearchInput } from '@/components/UsernameSearchInput';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

type EntityType = 'skill' | 'library_item' | 'career_goal';

interface GroupMember {
  role: string;
  profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
  entity: Record<string, unknown> | null;
}

function memberStat(entityType: EntityType, entity: Record<string, unknown> | null): string {
  if (!entity) return '';
  if (entityType === 'skill') return `Level ${entity.level} · ${entity.currentStreak ?? 0} day streak`;
  if (entityType === 'library_item') return `${entity.status} · ${entity.progressPercent ?? 0}%`;
  if (entityType === 'career_goal') return `${entity.status}`;
  return '';
}

async function fetchGroupDetail(groupId: string) {
  const res = await apiFetch(`/api/learnlog/groups/${groupId}`);
  if (!res.ok) throw new Error('Failed to load group');
  return res.json();
}

export function ShareGroupPanel({
  entityType,
  entityId,
  entityName,
}: {
  entityType: EntityType;
  entityId: string;
  entityName: string;
}) {
  const { toast } = useToast();
  const { data: mineData, mutate: mutateMine } = useSWR(
    `/api/learnlog/groups/mine?entityId=${entityId}`,
    async (url) => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Failed to load group');
      return res.json();
    }
  );
  const groupId: string | null = mineData?.group?.id ?? null;
  const { data: detail, mutate: mutateDetail } = useSWR(groupId ? `group-${groupId}` : null, () => fetchGroupDetail(groupId!));

  const [username, setUsername] = useState('');
  const [sharing, setSharing] = useState(false);
  const [inviting, setInviting] = useState(false);

  async function handleShare() {
    setSharing(true);
    try {
      const res = await apiFetch('/api/learnlog/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, name: entityName }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to share');
      await mutateMine();
      toast({ description: 'Sharing enabled.' });
    } catch (err) {
      toast({ title: 'Could not enable sharing', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  }

  async function handleInvite() {
    if (!groupId || !username.trim()) return;
    setInviting(true);
    try {
      const res = await apiFetch(`/api/learnlog/groups/${groupId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUsername: username.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to invite');
      toast({ description: `Invite sent to @${username.trim()}` });
      setUsername('');
      mutateDetail();
    } catch (err) {
      toast({ title: 'Could not send invite', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  }

  if (!groupId) {
    return (
      <Card>
        <CardContent className="pt-4">
          <Button variant="outline" className="w-full" onClick={handleShare} disabled={sharing}>
            {sharing ? 'Enabling…' : 'Share with others'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Shared with</p>
        {(detail?.members ?? []).map((m: GroupMember) => (
          <div key={m.profile?.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8">
                {m.profile?.avatarUrl && <AvatarImage src={m.profile.avatarUrl} alt={m.profile.username} />}
                <AvatarFallback>{m.profile?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="text-sm truncate">@{m.profile?.username}</p>
              {m.role === 'owner' && <Badge variant="secondary">Owner</Badge>}
            </div>
            <p className="text-xs text-muted-foreground shrink-0">{memberStat(entityType, m.entity)}</p>
          </div>
        ))}
        {detail?.myRole === 'owner' && (
          <div className="flex gap-2 pt-2 border-t">
            <UsernameSearchInput value={username} onChange={setUsername} />
            <Button onClick={handleInvite} disabled={inviting || !username.trim()}>
              {inviting ? 'Sending…' : 'Invite'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
