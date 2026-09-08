'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlanPreview } from '@/app/(burnlog)/burnlog/ai-setup/_components/PlanPreview';
import { AiLoading } from '@/components/kokonutui/ai-loading';
import { useToast } from '@/components/ui/use-toast';
import type { LifestyleAnswers, WorkoutPlanEntry } from '@/lib/ai/types';

type RegeneratePlanCardProps = {
  profileId: string;
  lifestyle: LifestyleAnswers;
};

export function RegeneratePlanCard({ profileId, lifestyle }: RegeneratePlanCardProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<'idle' | 'generating' | 'preview'>('idle');
  const [plan, setPlan] = useState<WorkoutPlanEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPlan = async (customInstructions?: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/ai/workout-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customInstructions ? { ...lifestyle, customInstructions } : lifestyle),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate a plan');
      setPlan(body.plan as WorkoutPlanEntry[]);
      setStatus('preview');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate a plan';
      setError(message);
      toast({ title: 'Generation failed', description: message, variant: 'destructive' });
      setStatus('idle');
      return false;
    }
  };

  const handleGenerate = async () => {
    setStatus('generating');
    await requestPlan();
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    await requestPlan();
    setRegenerating(false);
  };

  const handleAskAi = async (customInstructions: string) => {
    setRegenerating(true);
    const ok = await requestPlan(customInstructions);
    setRegenerating(false);
    if (!ok) throw new Error('Failed to generate a plan');
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const rows = plan.map((entry) => ({
        profileId,
        dayOfWeek: entry.dayOfWeek,
        bodyPart: entry.bodyPart,
        repeatWeekly: true,
      }));
      const { error: planError } = await supabase
        .from('workout_plans')
        .upsert(rows, { onConflict: 'profileId,dayOfWeek' });
      if (planError) throw planError;
      toast({ title: 'Plan updated', description: "Your Plan page's daily slots now reflect this schedule." });
      setStatus('idle');
      setPlan(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save your plan';
      setError(message);
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'generating') {
    return (
      <Card>
        <CardContent className="py-8">
          <AiLoading
            tasks={['Analyzing your goal', 'Building your weekly split', 'Balancing recovery days', 'Finalizing your plan']}
          />
        </CardContent>
      </Card>
    );
  }

  if (status === 'preview' && plan) {
    return (
      <PlanPreview
        plan={plan}
        saving={saving}
        regenerating={regenerating}
        onChange={setPlan}
        onSave={handleSave}
        onRegenerate={handleRegenerate}
        onAskAi={handleAskAi}
        onCancel={() => {
          setStatus('idle');
          setPlan(null);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workout plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Regenerate your weekly workout schedule using your current goal, fitness level, and training environment.
          Approved changes are pushed straight to your Plan page&apos;s daily slots.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleGenerate}>Regenerate workout plan</Button>
      </CardContent>
    </Card>
  );
}
