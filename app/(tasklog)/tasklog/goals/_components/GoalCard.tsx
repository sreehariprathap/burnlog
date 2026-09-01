// app/(tasklog)/tasklog/goals/_components/GoalCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { StatRing } from '@/components/ui/stat-ring';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import type { TaskGoalRow, TaskRow } from '@/lib/tasklog/types';
import { BreakdownReviewSheet, type BreakdownSuggestion } from './BreakdownReviewSheet';

interface GoalCardProps {
  goal: TaskGoalRow;
}

export function GoalCard({ goal }: GoalCardProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [linkedTasks, setLinkedTasks] = useState<TaskRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<BreakdownSuggestion[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState('');

  async function fetchLinkedTasks() {
    const { data } = await supabase.from('tasklog_tasks').select('*').eq('goalId', goal.id);
    setLinkedTasks((data as TaskRow[]) || []);
  }

  useEffect(() => {
    fetchLinkedTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.id]);

  const total = linkedTasks.length;
  const completed = linkedTasks.filter((t) => t.completedAt).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/ai/tasklog/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: goal.title, description: goal.description, category: goal.category }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate tasks');
      setSuggestions(body.tasks);
      setReviewOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate tasks';
      setError(message);
      toast({ title: 'Failed to generate tasks', description: message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm(selected: BreakdownSuggestion[]) {
    try {
      if (selected.length > 0) {
        const { error: insertError } = await supabase.from('tasklog_tasks').insert(
          selected.map((s) => ({
            profileId: goal.profileId,
            goalId: goal.id,
            title: s.title,
            category: s.category,
            priority: s.priority,
            dueDate: s.suggestedDueDate || null,
          }))
        );
        if (insertError) throw insertError;
        toast({ title: `${selected.length} task${selected.length === 1 ? '' : 's'} added to goal` });
      }
      setReviewOpen(false);
      await fetchLinkedTasks();
    } catch (err) {
      toast({
        title: 'Failed to add tasks',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  return (
    <StatCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          {goal.title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal capitalize">{goal.category}</span>
        </span>
      }
    >
      <div className="space-y-3">
        {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
        {total > 0 && (
          <div className="flex items-center gap-3">
            <StatRing value={pct} size="sm" className="text-xs" />
            <p className="text-xs text-muted-foreground">{completed}/{total} tasks done</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Thinking…' : total > 0 ? 'Regenerate tasks' : 'Generate tasks'}
        </Button>
      </div>
      <BreakdownReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        suggestions={suggestions}
        onConfirm={handleConfirm}
      />
    </StatCard>
  );
}
