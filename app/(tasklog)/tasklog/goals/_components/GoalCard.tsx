// app/(tasklog)/tasklog/goals/_components/GoalCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TaskGoalRow, TaskRow } from '@/lib/tasklog/types';
import { BreakdownReviewSheet, type BreakdownSuggestion } from './BreakdownReviewSheet';

interface GoalCardProps {
  goal: TaskGoalRow;
}

export function GoalCard({ goal }: GoalCardProps) {
  const supabase = createClientComponentClient();
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
      setError(err instanceof Error ? err.message : 'Failed to generate tasks');
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm(selected: BreakdownSuggestion[]) {
    if (selected.length > 0) {
      await supabase.from('tasklog_tasks').insert(
        selected.map((s) => ({
          profileId: goal.profileId,
          goalId: goal.id,
          title: s.title,
          category: s.category,
          priority: s.priority,
          dueDate: s.suggestedDueDate || null,
        }))
      );
    }
    setReviewOpen(false);
    await fetchLinkedTasks();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{goal.title}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal capitalize">{goal.category}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
        {total > 0 && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{completed}/{total} tasks done</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Thinking…' : total > 0 ? 'Regenerate tasks' : 'Generate tasks'}
        </Button>
      </CardContent>
      <BreakdownReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        suggestions={suggestions}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
