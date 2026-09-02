// app/(learnlog)/learnlog/career/_components/RoleDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type RoleDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function RoleDrawer({ profileId, open, onOpenChange, onSaved }: RoleDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isCurrent, setIsCurrent] = useState(true);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!title.trim() || !company.trim()) {
      setError('Title and company are required');
      return;
    }
    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('learnlog_career_roles').insert({
        profileId,
        title: title.trim(),
        company: company.trim(),
        startDate,
        endDate: isCurrent ? null : (endDate || null),
        notes: notes.trim() || null,
      });
      if (dbError) throw dbError;
      toast({ description: `Added ${title.trim()}.` });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save role', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add a role</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={isCurrent} onCheckedChange={(v) => setIsCurrent(!!v)} id="isCurrent" />
            <Label htmlFor="isCurrent">This is my current role</Label>
          </div>
          {!isCurrent && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
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
