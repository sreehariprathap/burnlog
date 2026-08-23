'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

type LogStepsModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogStepsModal({ profileId, onClose, onSaved }: LogStepsModalProps) {
  const supabase = createClientComponentClient();
  const [steps, setSteps] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!steps || isNaN(Number(steps)) || Number(steps) < 0) {
      setError('Please enter a valid step count');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('step_entries').insert([
        {
          profileId,
          date: new Date(date).toISOString(),
          steps: Number(steps),
        },
      ]);
      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save steps');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Steps</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="steps">Steps</Label>
            <Input id="steps" type="number" placeholder="e.g. 8000" value={steps} onChange={(e) => setSteps(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
