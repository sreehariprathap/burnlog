// app/(homelog)/homelog/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { RefreshCWIcon, type RefreshCCWIconWIcon } from '@/components/ui/refresh-cw';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UsernameSearchInput } from '@/components/UsernameSearchInput';
import { Skeleton } from '@/components/ui/skeleton';
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import { StatCard } from '@/components/ui/stat-card';
import { ListTodo, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { invitesQuery, choresQuery, balancesQuery } from '@/lib/homelog/queries';
import { formatCurrency } from '@/lib/format';

export default function HomeLogPage() {
  const { toast } = useToast();
  const refreshIconRef = useRef<RefreshCCWIconWIcon>(null);
  useMountAnimation(refreshIconRef);
  const { household, members, myRole, isLoading, refresh } = useHouseholdMe();
  const { profile } = useCurrentProfile();
  const { data: pendingInvites, mutate: mutateInvites } = useSWR(
    !isLoading && !household ? invitesQuery().key : null,
    !isLoading && !household ? invitesQuery().fetcher : null
  );
  const { data: choresForStats } = useSWR(
    household ? choresQuery().key : null,
    household ? choresQuery().fetcher : null
  );
  const { data: balancesForStats } = useSWR(
    household ? balancesQuery().key : null,
    household ? balancesQuery().fetcher : null
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const choresDueToday = (choresForStats ?? []).filter((c) => c.instance?.dueDate === todayStr).length;
  const myNetBalance = (balancesForStats ?? []).reduce((sum, b) => {
    if (b.memberA === profile?.id) return sum - b.net;
    if (b.memberB === profile?.id) return sum + b.net;
    return sum;
  }, 0);

  const [householdName, setHouseholdName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

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
      toast({ title: 'Household created' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create household';
      setCreateError(message);
      toast({ title: 'Failed to create household', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRespondToInvite(inviteId: string, action: 'accept' | 'decline') {
    setRespondingId(inviteId);
    try {
      const res = await fetch(`/api/homelog/invites/${inviteId}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to update invite');
      await mutateInvites();
      await refresh();
      toast({ title: action === 'accept' ? 'Invite accepted' : 'Invite declined' });
    } catch (err) {
      toast({
        title: 'Failed to update invite',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setRespondingId(null);
    }
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
      toast({ title: 'Invite sent' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invite';
      setInviteError(message);
      // "Already in a household" isn't really a failure on the sender's end —
      // it's a heads-up, so it gets a soft inline message rather than a hard
      // red toast. See the TODO in the invites route for the multi-household
      // follow-up this will eventually make moot.
      const isAlreadyInHousehold = message.includes('already part of a household');
      if (!isAlreadyInHousehold) {
        toast({ title: 'Failed to send invite', description: message, variant: 'destructive' });
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleLeave() {
    if (!household) return;
    setLeaving(true);
    try {
      const res = await fetch(`/api/homelog/households/${household.id}/leave`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to leave household');
      setConfirmingLeave(false);
      await refresh();
      toast({ title: 'Left household' });
    } catch (err) {
      toast({
        title: 'Failed to leave household',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setLeaving(false);
    }
  }

  async function handleRemoveMember(profileId: string) {
    if (!household) return;
    setConfirmingRemoveId(null);
    setRemovingMemberId(profileId);
    try {
      const res = await fetch(`/api/homelog/households/${household.id}/members/${profileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove member');
      await refresh();
      toast({ title: 'Member removed' });
    } catch (err) {
      toast({
        title: 'Failed to remove member',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setRemovingMemberId(null);
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="HomeLog"
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => refresh()}>
            <RefreshCWIcon ref={refreshIconRef} size={16} />
          </Button>
        }
      />
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
                    <Label htmlFor="household-name">Household name</Label>
                    <Input
                      id="household-name"
                      autoComplete="off"
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
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleRespondToInvite(invite.id, 'accept')}
                          disabled={respondingId === invite.id}
                        >
                          {respondingId === invite.id ? 'Saving…' : 'Accept'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRespondToInvite(invite.id, 'decline')}
                          disabled={respondingId === invite.id}
                        >
                          {respondingId === invite.id ? 'Saving…' : 'Decline'}
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
            <div className="grid grid-cols-2 gap-3">
              <StatCard title="Chores due today" icon={ListTodo}>
                <p className="text-2xl font-bold">{choresDueToday}</p>
              </StatCard>
              <StatCard title="Your balance" icon={Scale}>
                <p className={cn('text-2xl font-bold', myNetBalance < 0 ? 'text-destructive' : 'text-success')}>
                  {myNetBalance === 0 ? 'Settled up' : `${myNetBalance > 0 ? '+' : ''}${formatCurrency(myNetBalance)}`}
                </p>
              </StatCard>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{household.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {members.map((member) => (
                  <div key={member.profileId} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{member.firstName}</p>
                        <p className="text-xs text-muted-foreground">@{member.username}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{member.role}</span>
                        {myRole === 'owner' && member.role !== 'owner' && confirmingRemoveId !== member.profileId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmingRemoveId(member.profileId)}
                            disabled={removingMemberId === member.profileId}
                          >
                            {removingMemberId === member.profileId ? 'Removing…' : 'Remove'}
                          </Button>
                        )}
                      </div>
                    </div>
                    {confirmingRemoveId === member.profileId && (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Remove {member.firstName} from the household?
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveMember(member.profileId)}
                            disabled={removingMemberId === member.profileId}
                          >
                            {removingMemberId === member.profileId ? 'Removing…' : 'Confirm remove'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmingRemoveId(null)}
                            disabled={removingMemberId === member.profileId}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
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
                  <Label htmlFor="invite-username" className="sr-only">
                    Username to invite
                  </Label>
                  <UsernameSearchInput
                    id="invite-username"
                    value={inviteUsername}
                    onChange={setInviteUsername}
                  />
                  <Button type="submit" disabled={inviting}>
                    {inviting ? 'Sending…' : 'Invite'}
                  </Button>
                </form>
                {inviteError && (
                  <p
                    className={cn(
                      'mt-2 text-sm',
                      inviteError.includes('already part of a household') ? 'text-muted-foreground' : 'text-destructive'
                    )}
                  >
                    {inviteError}
                  </p>
                )}
                {inviteSuccess && <p className="mt-2 text-sm text-success">{inviteSuccess}</p>}
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
