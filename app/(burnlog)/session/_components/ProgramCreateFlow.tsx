// app/(burnlog)/session/_components/ProgramCreateFlow.tsx
'use client';

import { useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mountain } from 'lucide-react';
import type { GeneratedProgram } from '@/lib/ai/program';

type ProgramCreateFlowProps = {
  profileId: string;
  onCreated: () => void;
};

export function ProgramCreateFlow({ profileId, onCreated }: ProgramCreateFlowProps) {
  const supabase = createClientComponentClient();
  const [pastedPlanText, setPastedPlanText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedProgram | null>(null);
  // Synchronous guard against a double "Save" click firing two overlapping
  // handleSave runs before the `saving` state re-render lands — without
  // this, two interleaved delete+insert sequences can orphan a program's
  // weeks (see final review). `saving` state alone doesn't close that
  // same-tick window; this ref does.
  const savingRef = useRef(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedPlanText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate program');
      setGenerated(data.program as GeneratedProgram);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate program');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generated || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const workoutRows = generated.weekdayTemplate.map((entry) => ({
        profileId,
        dayOfWeek: entry.dayOfWeek,
        bodyPart: entry.bodyPart,
        repeatWeekly: true,
      }));
      const { error: workoutError } = await supabase
        .from('workout_plans')
        .upsert(workoutRows, { onConflict: 'profileId,dayOfWeek' });
      if (workoutError) throw workoutError;

      // Replace any existing program for this profile (cascades its weeks).
      await supabase.from('programs').delete().eq('profileId', profileId);

      const { data: programRow, error: programError } = await supabase
        .from('programs')
        .insert({
          profileId,
          title: generated.title,
          subtitle: generated.subtitle,
          totalWeeks: generated.totalWeeks,
          startWeight: generated.startWeight,
          targetWeight: generated.targetWeight,
          rules: generated.rules,
          mealPlan: generated.mealPlan,
        })
        .select('id')
        .single();
      if (programError || !programRow) throw programError || new Error('Failed to create program');

      const weekRows = generated.weeks.map((w) => ({
        programId: programRow.id,
        weekIndex: w.weekIndex,
        title: w.title,
        subtitle: w.subtitle,
        socialActivity: w.socialActivity,
        soloActivity: w.soloActivity,
        checklist: w.checklist.map((label) => ({ label, checked: false })),
      }));
      const { error: weeksError } = await supabase.from('program_weeks').insert(weekRows);
      if (weeksError) throw weeksError;

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save program');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (generated) {
    return (
      <div className="space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mountain className="size-5 text-primary" />
              {generated.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{generated.subtitle}</p>
            <p>{generated.totalWeeks} weeks · {generated.weeks.length} weekly checklists generated</p>
            {generated.startWeight && generated.targetWeight && (
              <p>{generated.startWeight}kg → {generated.targetWeight}kg</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {generated.weeks.map((w) => (
            <div key={w.weekIndex} className="rounded-lg border p-3 text-sm">
              <span className="font-medium">Week {w.weekIndex}: {w.title}</span>
              <p className="text-xs text-muted-foreground">{w.checklist.join(' · ')}</p>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGenerated(null)} disabled={saving}>
            Regenerate
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save Program'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mountain className="size-5 text-primary" />
            Start a Program
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste a multi-week transformation plan (from an AI chat, a coach, or your own notes) and it'll be
            structured into a trackable program with weekly checklists.
          </p>
          <Textarea
            value={pastedPlanText}
            onChange={(e) => setPastedPlanText(e.target.value)}
            placeholder="Paste your plan here..."
            rows={8}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleGenerate} disabled={generating || pastedPlanText.trim().length < 20}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : 'Generate Program'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
