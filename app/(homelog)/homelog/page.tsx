// app/(homelog)/homelog/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';

interface PendingInvite {
  id: string;
  householdId: string;
  householdName: string;
  invitedByUsername: string;
  createdAt: string;
}

async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const res = await fetch('/api/homelog/invites');
  const body = await res.json();
  return body.invites ?? [];
}

export default function HomeLogPage() {
  const { household, members, myRole, isLoading, refresh } = useHouseholdMe();
  const { profile } = useCurrentProfile();
  const { data: pendingInvites, mutate: mutateInvites } = useSWR(
    !isLoading && !household ? 'homelog-invites' : null,
    fetchPendingInvites
  );

  const [householdName, setHouseholdName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!householdName.trim()) {
      setCreateError('Please enter a household name');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      const res = await fetch('/api/homelog/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: householdName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create household');
      setHouseholdName('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create household');
    } finally {
      setCreating(false);
    }
  }

  async function handleRespondToInvite(inviteId: string, action: 'accept' | 'decline') {
    await fetch(`/api/homelog/invites/${inviteId}/${action}`, { method: 'POST' });
    await mutateInvites();
    await refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteUsername.trim()) {
      setInviteError('Please enter a username');
      return;
    }
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);
    try {
      const res = await fetch('/api/homelog/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUsername: inviteUsername.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to send invite');
      setInviteSuccess(`Invite sent to @${inviteUsername.trim()}`);
      setInviteUsername('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleLeave() {
    if (!household) return;
    setLeaving(true);
    try {
      await fetch(`/api/homelog/households/${household.id}/leave`, { method: 'POST' });
      setConfirmingLeave(false);
      await refresh();
    } finally {
      setLeaving(false);
    }
  }

  async function handleRemoveMember(profileId: string) {
    if (!household) return;
    await fetch(`/api/homelog/households/${household.id}/members/${profileId}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className="pb-24">
      <TopBar title="HomeLog" />
      {profile && <CrossAppSnapshot currentApp="homelog" profileId={profile.id} />}
      <div className="flex flex-col gap-4 px-4 py-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !household ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Create a household</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateHousehold} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Household name</Label>
                    <Input
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      placeholder="e.g. The Smith House"
                    />
                  </div>
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Creating…' : 'Create household'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {(pendingInvites?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending invites</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingInvites!.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{invite.householdName}</p>
                        <p className="text-xs text-muted-foreground">Invited by @{invite.invitedByUsername}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => handleRespondToInvite(invite.id, 'accept')}>
                          Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRespondToInvite(invite.id, 'decline')}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{household.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {members.map((member) => (
                  <div key={member.profileId} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{member.firstName}</p>
                      <p className="text-xs text-muted-foreground">@{member.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{member.role}</span>
                      {myRole === 'owner' && member.role !== 'owner' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveMember(member.profileId)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invite by username</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInvite} className="flex gap-2">
                  <Input
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="username"
                  />
                  <Button type="submit" disabled={inviting}>
                    {inviting ? 'Sending…' : 'Invite'}
                  </Button>
                </form>
                {inviteError && <p className="mt-2 text-sm text-destructive">{inviteError}</p>}
                {inviteSuccess && <p className="mt-2 text-sm text-emerald-600">{inviteSuccess}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                {!confirmingLeave ? (
                  <Button type="button" variant="outline" onClick={() => setConfirmingLeave(true)}>
                    Leave household
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {myRole === 'owner' && members.length > 1
                        ? 'You are the owner — ownership will transfer to another member. Leave anyway?'
                        : myRole === 'owner'
                          ? "You're the only member — the household will be deleted. Leave anyway?"
                          : 'Are you sure you want to leave this household?'}
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" variant="destructive" onClick={handleLeave} disabled={leaving}>
                        {leaving ? 'Leaving…' : 'Confirm leave'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setConfirmingLeave(false)} disabled={leaving}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <HomeLogBottomNav />
    </div>
  );
}
