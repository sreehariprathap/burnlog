// app/(learnlog)/learnlog/career/_components/CertDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type CertDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function CertDrawer({ profileId, open, onOpenChange, onSaved }: CertDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [earnedAt, setEarnedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('learnlog_career_certifications').insert({
        profileId,
        name: name.trim(),
        issuer: issuer.trim() || null,
        earnedAt,
        expiresAt: expiresAt || null,
        notes: notes.trim() || null,
      });
      if (dbError) throw dbError;
      toast({ description: `Added ${name.trim()}.` });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save certification', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add a certification</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="issuer">Issuer (optional)</Label>
            <Input id="issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="earnedAt">Earned</Label>
            <Input id="earnedAt" type="date" value={earnedAt} onChange={(e) => setEarnedAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expiresAt">Expires (optional)</Label>
            <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
