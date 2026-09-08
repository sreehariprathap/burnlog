'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil } from 'lucide-react';
import {
  GOAL_FOCUS_OPTIONS,
  FITNESS_LEVEL_OPTIONS,
  type GoalFocus,
  type FitnessLevel,
  type LifestyleAnswers,
} from '@/lib/ai/types';
import { seedMissingFitnessGoals } from '@/lib/burnlog/goalDefaults';
import { refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import type { FitnessGoal } from '@/lib/burnlog/queries';

type GoalFocusCardProps = {
  profileId: string;
  lifestyle: LifestyleAnswers | null;
  existingGoalTypes: string[];
  onGoalsSeeded: (newGoals: FitnessGoal[]) => void;
};

export function GoalFocusCard({ profileId, lifestyle, existingGoalTypes, onGoalsSeeded }: GoalFocusCardProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [goalFocus, setGoalFocus] = useState<GoalFocus>(lifestyle?.goalFocus ?? 'general_health');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(lifestyle?.fitnessLevel ?? 'intermediate');
  const [saving, setSaving] = useState(false);

  if (!lifestyle) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set your health goal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Complete AI setup to set a primary health goal — it drives your AI-generated workout plan and Insights.
          </p>
          <Button asChild>
            <Link href="/burnlog/ai-setup?returnTo=/burnlog/goals">Start AI setup</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const goalFocusLabel =
    GOAL_FOCUS_OPTIONS.find((o) => o.value === lifestyle.goalFocus)?.label ?? lifestyle.goalFocus;
  const fitnessLevelLabel =
    FITNESS_LEVEL_OPTIONS.find((o) => o.value === (lifestyle.fitnessLevel ?? 'intermediate'))?.label ?? 'Intermediate';

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedLifestyle: LifestyleAnswers = { ...lifestyle, goalFocus, fitnessLevel };
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ lifestyle: updatedLifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;

      const seeded = await seedMissingFitnessGoals(supabase, profileId, goalFocus, existingGoalTypes);
      await refreshCurrentProfile();
      if (seeded.length > 0) onGoalsSeeded(seeded);

      toast({
        title: 'Goal updated',
        description: `Now focused on: ${GOAL_FOCUS_OPTIONS.find((o) => o.value === goalFocus)?.label}`,
      });
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update your goal';
      toast({ title: 'Update failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Your goal</CardTitle>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Edit goal">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          <>
            <p className="text-sm">
              <span className="text-muted-foreground">Focus:</span> {goalFocusLabel}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Fitness level:</span> {fitnessLevelLabel}
            </p>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Primary goal</Label>
              <Select value={goalFocus} onValueChange={(v) => setGoalFocus(v as GoalFocus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_FOCUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fitness level</Label>
              <Select value={fitnessLevel} onValueChange={(v) => setFitnessLevel(v as FitnessLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FITNESS_LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
