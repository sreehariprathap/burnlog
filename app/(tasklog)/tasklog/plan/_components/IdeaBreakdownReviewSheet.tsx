// app/(tasklog)/tasklog/plan/_components/IdeaBreakdownReviewSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import type { IdeaRow, TaskCategory, TaskPriority } from '@/lib/tasklog/types';

export interface BreakdownSuggestion {
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  suggestedDueDate?: string | null;
}

interface IdeaBreakdownReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: IdeaRow | null;
  onConfirm: (plan: string, selected: BreakdownSuggestion[]) => Promise<void>;
}

export function IdeaBreakdownReviewSheet({ open, onOpenChange, idea, onConfirm }: IdeaBreakdownReviewSheetProps) {
  const { toast } = useToast();
  const [plan, setPlan] = useState('');
  const [items, setItems] = useState<(BreakdownSuggestion & { selected: boolean })[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !idea) {
      setPlan('');
      setItems([]);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/api/ai/tasklog/idea-breakdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: idea.title, notes: idea.notes, category: idea.category }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to generate plan');
        if (cancelled) return;
        setPlan(body.plan);
        setItems((body.tasks as BreakdownSuggestion[]).map((s) => ({ ...s, selected: true })));
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to generate plan';
          setError(message);
          toast({ title: 'Failed to generate plan', description: message, variant: 'destructive' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, idea]);

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
      await onConfirm(plan, selected);
    } catch (err) {
      toast({
        title: 'Failed to save plan',
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
          <DrawerTitle>Review idea plan</DrawerTitle>
        </DrawerHeader>
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto px-4">
          {loading && <p className="text-sm text-muted-foreground">Generating plan…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && plan && <p className="rounded-md border bg-muted/50 p-3 text-sm">{plan}</p>}
          {!loading &&
            items.map((item, index) => (
              <div key={index} className="flex items-center gap-2 rounded-md border p-2">
                <Checkbox
                  checked={item.selected}
                  onCheckedChange={() => toggleSelected(index)}
                  aria-label={`Include task "${item.title}"`}
                />
                <Label htmlFor={`idea-breakdown-title-${index}`} className="sr-only">Task title</Label>
                <Input
                  id={`idea-breakdown-title-${index}`}
                  value={item.title}
                  onChange={(e) => updateTitle(index, e.target.value)}
                  className="h-8 flex-1"
                  autoComplete="off"
                  autoFocus={index === 0}
                />
                <span className="text-xs capitalize text-muted-foreground">{item.priority}</span>
              </div>
            ))}
        </div>
        <DrawerFooter>
          <Button type="button" onClick={handleConfirm} disabled={saving || loading || items.length === 0}>
            {saving ? 'Adding…' : `Add ${selectedCount} selected`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
