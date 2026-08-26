// app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { TaskCategory, TaskPriority } from '@/lib/tasklog/types';

export interface BreakdownSuggestion {
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  suggestedDueDate?: string | null;
}

interface BreakdownReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: BreakdownSuggestion[];
  onConfirm: (selected: BreakdownSuggestion[]) => Promise<void>;
}

export function BreakdownReviewSheet({ open, onOpenChange, suggestions, onConfirm }: BreakdownReviewSheetProps) {
  const [items, setItems] = useState<(BreakdownSuggestion & { selected: boolean })[]>([]);
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
      const selected = items
        .filter((item) => item.selected)
        .map((item) => ({
          title: item.title,
          category: item.category,
          priority: item.priority,
          suggestedDueDate: item.suggestedDueDate,
        }));
      await onConfirm(selected);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Review suggested tasks</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto px-4">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border p-2">
              <Checkbox checked={item.selected} onCheckedChange={() => toggleSelected(index)} />
              <Input value={item.title} onChange={(e) => updateTitle(index, e.target.value)} className="h-8 flex-1" />
              <span className="text-xs capitalize text-muted-foreground">{item.priority}</span>
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
