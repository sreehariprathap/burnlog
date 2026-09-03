// app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import type { TaskCategory, TaskPriority } from '@/lib/tasklog/types';

export interface BreakdownSuggestion {
  title: string;
  description?: string;
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
  const { toast } = useToast();
  const [items, setItems] = useState<(BreakdownSuggestion & { selected: boolean })[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(suggestions.map((s) => ({ ...s, selected: true })));
  }, [suggestions]);

  function updateTitle(index: number, title: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, title } : item)));
  }

  function updateDescription(index: number, description: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, description } : item)));
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
          description: item.description,
          category: item.category,
          priority: item.priority,
          suggestedDueDate: item.suggestedDueDate,
        }));
      await onConfirm(selected);
    } catch (err) {
      toast({
        title: 'Failed to add tasks',
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
          <DrawerTitle>Review suggested tasks</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto px-4">
          {items.map((item, index) => (
            <div key={index} className="flex items-start gap-2 rounded-md border p-2">
              <Checkbox
                checked={item.selected}
                onCheckedChange={() => toggleSelected(index)}
                aria-label={`Include task "${item.title}"`}
                className="mt-1.5"
              />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`breakdown-title-${index}`} className="sr-only">Task title</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`breakdown-title-${index}`}
                    value={item.title}
                    onChange={(e) => updateTitle(index, e.target.value)}
                    className="h-8 flex-1"
                    autoComplete="off"
                    autoFocus={index === 0}
                  />
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{item.priority}</span>
                </div>
                <Label htmlFor={`breakdown-description-${index}`} className="sr-only">Task description</Label>
                <Textarea
                  id={`breakdown-description-${index}`}
                  value={item.description ?? ''}
                  onChange={(e) => updateDescription(index, e.target.value)}
                  placeholder="Description (optional)"
                  className="min-h-16 text-sm"
                />
              </div>
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
