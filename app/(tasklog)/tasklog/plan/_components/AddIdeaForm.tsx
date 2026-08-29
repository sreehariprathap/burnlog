// app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IDEA_CATEGORIES, type IdeaCategory, type IdeaRow } from '@/lib/tasklog/types';

interface AddIdeaFormProps {
  profileId: string;
  onIdeaAdded: (idea: IdeaRow) => void;
}

export function AddIdeaForm({ profileId, onIdeaAdded }: AddIdeaFormProps) {
  const supabase = createClientComponentClient();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('idea');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter an idea title');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from('tasklog_ideas')
        .insert([{ profileId, title: title.trim(), category }])
        .select()
        .single();
      if (insertError) throw insertError;
      onIdeaAdded(data as IdeaRow);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add idea');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture an idea</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Subscription box for plant care" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as IdeaCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {IDEA_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add idea'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
