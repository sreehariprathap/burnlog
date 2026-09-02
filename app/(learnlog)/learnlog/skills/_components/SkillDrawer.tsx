// app/(learnlog)/learnlog/skills/_components/SkillDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type SkillDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function SkillDrawer({ profileId, open, onOpenChange, onSaved }: SkillDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName('');
    setCategory('');
    setNameError(null);
  }

  async function handleSave() {
    setNameError(null);
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('learnlog_skills').insert({
        profileId,
        name: name.trim(),
        category: category.trim() || null,
      });
      if (error) throw error;
      toast({ description: `Added ${name.trim()}.` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save skill', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add a skill</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skiing" />
            {nameError && <p className="text-red-500 text-xs">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Category (optional)</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. winter sports" />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
