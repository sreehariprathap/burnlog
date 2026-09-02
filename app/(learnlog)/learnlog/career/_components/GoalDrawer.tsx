// app/(learnlog)/learnlog/career/_components/GoalDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type GoalDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function GoalDrawer({ profileId, open, onOpenChange, onSaved }: GoalDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('learnlog_career_goals').insert({
        profileId,
        title: title.trim(),
        targetDate: targetDate || null,
        notes: notes.trim() || null,
        status: 'active',
      });
      if (dbError) throw dbError;
      toast({ description: `Added ${title.trim()}.` });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save goal', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add a career goal</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Become a Staff Engineer" />
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetDate">Target date (optional)</Label>
            <Input id="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
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
