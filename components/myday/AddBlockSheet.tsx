'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import type { MyDayBlock } from '@/lib/myday/types';

interface AddBlockSheetProps {
  date: string;
  block?: MyDayBlock;
  prefillTitle?: string;
  prefillSource?: MyDayBlock['source'];
  prefillSourceId?: string | null;
  initialStartTime?: string;
  onClose: () => void;
  onSaved: () => void;
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const nextHour = (h + 1) % 24;
  return `${String(nextHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function AddBlockSheet({
  date,
  block,
  prefillTitle,
  prefillSource,
  prefillSourceId,
  initialStartTime,
  onClose,
  onSaved,
}: AddBlockSheetProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(block?.title ?? prefillTitle ?? '');
  const [notes, setNotes] = useState(block?.notes ?? '');
  const [startTime, setStartTime] = useState(block?.startTime ?? initialStartTime ?? '09:00');
  const [endTime, setEndTime] = useState(
    block?.endTime ?? (initialStartTime ? addHour(initialStartTime) : '10:00')
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(block);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) return setError('Enter a title');
    if (!startTime || !endTime) return setError('Set a start and end time');
    if (endTime <= startTime) return setError('End time must be after start time');

    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/myday/${block!.id}` : '/api/myday', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { title: title.trim(), notes: notes.trim() || null, startTime, endTime }
            : {
                date,
                title: title.trim(),
                notes: notes.trim() || null,
                startTime,
                endTime,
                source: prefillSource ?? 'manual',
                sourceId: prefillSourceId ?? null,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to save');
        return;
      }
      toast({ description: isEdit ? 'Block updated' : 'Block added to your day' });
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!block) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/myday/${block.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ description: 'Block removed' });
      onSaved();
    } catch {
      setError('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit block' : 'Add to your day'}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="space-y-1">
            <Label htmlFor="myday-title">Title</Label>
            <Input id="myday-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning run" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="myday-start">Start</Label>
              <Input id="myday-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="myday-end">End</Label>
              <Input id="myday-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="myday-notes">Notes</Label>
            <Textarea id="myday-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            {isEdit && (
              <Button type="button" variant="outline" size="icon" onClick={handleDelete} disabled={deleting} aria-label="Delete block">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
