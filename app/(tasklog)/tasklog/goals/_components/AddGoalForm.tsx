// app/(tasklog)/tasklog/goals/_components/AddGoalForm.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TaskCategory, TaskGoalRow } from '@/lib/tasklog/types';

interface AddGoalFormProps {
  profileId: string;
  onGoalAdded: (goal: TaskGoalRow) => void;
}

export function AddGoalForm({ profileId, onGoalAdded }: AddGoalFormProps) {
  const supabase = createClientComponentClient();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add goal');
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
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Get better at Spanish" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="life">Life</SelectItem>
                <SelectItem value="work">Work</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add goal'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
