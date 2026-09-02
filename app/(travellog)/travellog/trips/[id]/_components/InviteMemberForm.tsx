// app/(travellog)/travellog/trips/[id]/_components/InviteMemberForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

export function InviteMemberForm({ planId, onInvited }: { planId: string; onInvited: () => void }) {
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleInvite() {
    if (!username.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/travellog/plans/${planId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUsername: username.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to send invite');
      toast({ description: `Invite sent to @${username.trim()}` });
      setUsername('');
      onInvited();
    } catch (err) {
      toast({ title: 'Could not send invite', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      <Button onClick={handleInvite} disabled={saving || !username.trim()}>
        {saving ? 'Sending…' : 'Invite'}
      </Button>
    </div>
  );
}
