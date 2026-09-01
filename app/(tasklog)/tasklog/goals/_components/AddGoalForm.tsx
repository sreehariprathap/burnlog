// app/(tasklog)/tasklog/goals/_components/AddGoalForm.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import type { TaskCategory, TaskGoalRow } from '@/lib/tasklog/types';

interface AddGoalFormProps {
  profileId: string;
  onGoalAdded: (goal: TaskGoalRow) => void;
}

export function AddGoalForm({ profileId, onGoalAdded }: AddGoalFormProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('life');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a goal title');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from('task_goals')
        .insert([{ profileId, title: title.trim(), description: description.trim() || null, category }])
        .select()
        .single();
      if (insertError) throw insertError;
      onGoalAdded(data as TaskGoalRow);
      setTitle('');
      setDescription('');
      toast({ title: 'Goal added' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add goal';
      setError(message);
      toast({ title: 'Failed to add goal', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a goal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Get better at Spanish"
              autoComplete="off"
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? 'goal-title-error' : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-description">Description (optional)</Label>
            <Textarea id="goal-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
              <SelectTrigger id="goal-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="life">Life</SelectItem>
                <SelectItem value="work">Work</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p id="goal-title-error" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add goal'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
