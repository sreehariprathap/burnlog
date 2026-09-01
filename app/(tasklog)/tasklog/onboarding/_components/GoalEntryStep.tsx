// app/(tasklog)/tasklog/onboarding/_components/GoalEntryStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import type { TaskCategory } from '@/lib/tasklog/types';

export interface GoalDraft {
  title: string;
  description: string;
  category: TaskCategory;
}

interface GoalEntryStepProps {
  goals: GoalDraft[];
  onAdd: (goal: GoalDraft) => void;
  onRemove: (index: number) => void;
  onContinue: () => void;
}

export function GoalEntryStep({ goals, onAdd, onRemove, onContinue }: GoalEntryStepProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('life');

  function handleAdd() {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), description: description.trim(), category });
    setTitle('');
    setDescription('');
    setCategory('life');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add your goals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.length > 0 && (
          <ul className="space-y-2">
            {goals.map((goal, index) => (
              <li key={index} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {goal.title} <span className="text-xs text-muted-foreground capitalize">({goal.category})</span>
                </span>
                <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${goal.title}`}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-goal-title">Goal title</Label>
            <Input
              id="onboarding-goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Get better at Spanish"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-goal-description">Description (optional)</Label>
            <Textarea
              id="onboarding-goal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-goal-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
              <SelectTrigger id="onboarding-goal-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="life">Life</SelectItem>
                <SelectItem value="work">Work</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={handleAdd} disabled={!title.trim()}>
            Add goal
          </Button>
        </div>
        <Button className="w-full" disabled={goals.length === 0} onClick={onContinue}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
