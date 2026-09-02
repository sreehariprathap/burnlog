// app/(learnlog)/learnlog/reflections/_components/ReflectionDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type ReflectionDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function ReflectionDrawer({ profileId, open, onOpenChange, onSaved }: ReflectionDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      const { error: dbError } = await supabase.from('learnlog_reflections').insert({
        profileId,
        title: title.trim(),
        body: body.trim(),
        tags,
      });
      if (dbError) throw dbError;
      toast({ description: 'Reflection saved.' });
      setTitle('');
      setBody('');
      setTagsInput('');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save reflection', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>New reflection</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="body">Entry</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tags">Tags (comma-separated, optional)</Label>
            <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="gratitude, meditation" />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
