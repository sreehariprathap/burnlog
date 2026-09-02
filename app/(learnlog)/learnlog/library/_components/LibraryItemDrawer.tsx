// app/(learnlog)/learnlog/library/_components/LibraryItemDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import type { LibraryItemType } from '@/lib/learnlog/types';

type LibraryItemDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function LibraryItemDrawer({ profileId, open, onOpenChange, onSaved }: LibraryItemDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [type, setType] = useState<LibraryItemType>('BOOK');
  const [title, setTitle] = useState('');
  const [authorOrProvider, setAuthorOrProvider] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [cost, setCost] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setType('BOOK');
    setTitle('');
    setAuthorOrProvider('');
    setSourceUrl('');
    setCost('');
    setTitleError(null);
  }

  async function handleSave() {
    setTitleError(null);
    if (!title.trim()) {
      setTitleError('Title is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('learnlog_library_items').insert({
        profileId,
        type,
        title: title.trim(),
        authorOrProvider: authorOrProvider.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        cost: cost.trim() ? Number(cost) : null,
        status: 'WANT',
      });
      if (error) throw error;
      toast({ description: `Added ${title.trim()}.` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save item', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add book or course</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LibraryItemType)}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOK">Book</SelectItem>
                <SelectItem value="COURSE">Course</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Atomic Habits" />
            {titleError && <p className="text-red-500 text-xs">{titleError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="authorOrProvider">{type === 'BOOK' ? 'Author' : 'Provider'} (optional)</Label>
            <Input id="authorOrProvider" value={authorOrProvider} onChange={(e) => setAuthorOrProvider(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sourceUrl">Link (optional)</Label>
            <Input id="sourceUrl" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cost">Cost (optional)</Label>
            <Input id="cost" type="number" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
