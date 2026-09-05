// app/(learnlog)/learnlog/skills/[id]/_components/MilestoneList.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import type { SkillMilestoneRow } from '@/lib/learnlog/types';

type MilestoneListProps = {
  skillId: string;
  milestones: SkillMilestoneRow[];
  onChanged: () => void;
};

export function MilestoneList({ skillId, milestones, onChanged }: MilestoneListProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function addMilestone() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('learnlog_skill_milestones').insert({
        skillId,
        title: newTitle.trim(),
      });
      if (error) throw error;
      setNewTitle('');
      onChanged();
    } catch (err) {
      toast({ title: 'Could not add milestone', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAchieved(milestone: SkillMilestoneRow) {
    const { error } = await supabase
      .from('learnlog_skill_milestones')
      .update({ achievedAt: milestone.achievedAt ? null : new Date().toISOString() })
      .eq('id', milestone.id);
    if (error) {
      toast({ title: 'Could not update milestone', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();
  }

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="font-medium text-sm">Milestones</p>
        {milestones.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <Checkbox checked={!!m.achievedAt} onCheckedChange={() => toggleAchieved(m)} id={`milestone-${m.id}`} />
            <Label htmlFor={`milestone-${m.id}`} className={m.achievedAt ? 'line-through text-muted-foreground text-sm font-normal' : 'text-sm font-normal'}>
              {m.title}
            </Label>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Parallel turns"
            onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(); }}
          />
          <Button type="button" variant="outline" onClick={addMilestone} disabled={saving || !newTitle.trim()}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
