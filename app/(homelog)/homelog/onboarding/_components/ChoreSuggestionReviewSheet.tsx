// app/(homelog)/homelog/onboarding/_components/ChoreSuggestionReviewSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export interface ChoreSuggestion {
  title: string;
  category: 'cleaning' | 'maintenance' | 'other';
  frequency: 'weekly' | 'monthly' | 'yearly';
  dayOfWeek: number | null;
}

interface ChoreSuggestionReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: ChoreSuggestion[];
  onConfirm: (selected: ChoreSuggestion[]) => Promise<void>;
}

export function ChoreSuggestionReviewSheet({ open, onOpenChange, suggestions, onConfirm }: ChoreSuggestionReviewSheetProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<(ChoreSuggestion & { selected: boolean })[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(suggestions.map((s) => ({ ...s, selected: true })));
  }, [suggestions]);

  function updateTitle(index: number, title: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, title } : item)));
  }

  function toggleSelected(index: number) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)));
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const selected = items.filter((item) => item.selected).map(({ selected: _selected, ...rest }) => rest);
      await onConfirm(selected);
    } catch (err) {
      toast({
        title: 'Failed to add chores',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Review suggested chores</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto px-4">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border p-2">
              <Checkbox
                checked={item.selected}
                onCheckedChange={() => toggleSelected(index)}
                aria-label={`Include chore "${item.title}"`}
              />
              <Label htmlFor={`chore-title-${index}`} className="sr-only">Chore title</Label>
              <Input
                id={`chore-title-${index}`}
                value={item.title}
                onChange={(e) => updateTitle(index, e.target.value)}
                className="h-8 flex-1"
                autoComplete="off"
              />
              <span className="text-xs capitalize text-muted-foreground">{item.frequency}</span>
            </div>
          ))}
        </div>
        <DrawerFooter>
          <Button type="button" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Adding…' : `Add ${selectedCount} selected`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
