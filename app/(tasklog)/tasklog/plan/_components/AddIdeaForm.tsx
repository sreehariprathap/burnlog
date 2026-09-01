// app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { IDEA_CATEGORIES, type IdeaCategory, type IdeaRow } from '@/lib/tasklog/types';

interface AddIdeaFormProps {
  profileId: string;
  onIdeaAdded: (idea: IdeaRow) => void;
}

export function AddIdeaForm({ profileId, onIdeaAdded }: AddIdeaFormProps) {
  const supabase = createClient();
  const { toast } = useToast();
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
      toast({ title: 'Idea captured' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add idea';
      setError(message);
      toast({ title: 'Failed to add idea', description: message, variant: 'destructive' });
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
            <Label htmlFor="idea-title">Title</Label>
            <Input
              id="idea-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Subscription box for plant care"
              autoComplete="off"
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? 'idea-title-error' : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as IdeaCategory)}>
              <SelectTrigger id="idea-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IDEA_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p id="idea-title-error" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add idea'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
