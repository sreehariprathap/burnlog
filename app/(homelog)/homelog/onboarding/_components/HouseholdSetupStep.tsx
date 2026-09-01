// app/(homelog)/homelog/onboarding/_components/HouseholdSetupStep.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface PendingInvite {
  id: string;
  householdId: string;
  householdName: string;
  invitedByUsername: string;
  createdAt: string;
}

interface HouseholdSetupStepProps {
  onCreated: (household: { id: string; name: string }) => void;
  onJoined: () => void;
}

export function HouseholdSetupStep({ onCreated, onJoined }: HouseholdSetupStepProps) {
  const { toast } = useToast();
  const [householdName, setHouseholdName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/homelog/invites');
        const body = await res.json();
        setInvites(body.invites ?? []);
      } finally {
        setInvitesLoading(false);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
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
      onCreated(body.household);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create household';
      setCreateError(message);
      toast({ title: 'Failed to create household', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRespond(inviteId: string, action: 'accept' | 'decline') {
    setRespondingId(inviteId);
    try {
      const res = await fetch(`/api/homelog/invites/${inviteId}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to update invite');
      if (action === 'accept') {
        onJoined();
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Create a household</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-household-name">Household name</Label>
              <Input
                id="onboarding-household-name"
                autoFocus
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

      {!invitesLoading && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{invite.householdName}</p>
                  <p className="text-xs text-muted-foreground">Invited by @{invite.invitedByUsername}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleRespond(invite.id, 'accept')}
                    disabled={respondingId === invite.id}
                  >
                    {respondingId === invite.id ? 'Saving…' : 'Accept'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRespond(invite.id, 'decline')}
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
    </div>
  );
}
