// app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import { APPS, isAppId } from '@/lib/appMode';
import { WelcomeStep } from './WelcomeStep';
import { GoalEntryStep, type GoalDraft } from './GoalEntryStep';
import { DoneStep } from './DoneStep';
import {
  BreakdownReviewSheet,
  type BreakdownSuggestion,
} from '@/app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet';

type Step = 'welcome' | 'goals' | 'breakdown' | 'done';

export function TaskLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/tasklog';
  // When the onboarding sequence router sent us here, it tells us which app
  // comes next so the "done" screen can point at the real next step instead
  // of always naming this app.
  const nextAppParam = searchParams.get('nextApp');
  const isLastStep = searchParams.get('lastStep') === '1';
  const finishLabel = isAppId(nextAppParam)
    ? `Go to ${APPS[nextAppParam].name}`
    : isLastStep
      ? 'Finish setup'
      : 'Go to TaskLog';
  const supabase = createClient();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('welcome');
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null);
  const [currentGoalTitle, setCurrentGoalTitle] = useState<string>('');
  const [suggestions, setSuggestions] = useState<BreakdownSuggestion[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [goalCount, setGoalCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  async function processGoal(index: number) {
    if (index >= goalDrafts.length) {
      setStep('done');
      return;
    }
    if (!profile) return;

    const draft = goalDrafts[index];
    const { data: goal, error: insertError } = await supabase
      .from('task_goals')
      .insert([{ profileId: profile.id, title: draft.title, description: draft.description || null, category: draft.category }])
      .select()
      .single();

    if (insertError || !goal) {
      toast({ title: `Could not create goal "${draft.title}"`, description: insertError?.message, variant: 'destructive' });
      processGoal(index + 1);
      return;
    }
    setGoalCount((prev) => prev + 1);

    try {
      const res = await fetch('/api/ai/tasklog/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, description: draft.description, category: draft.category }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate tasks');
      setSuggestions(body.tasks);
      setCurrentGoalId(goal.id);
      setCurrentGoalTitle(goal.title);
      setProcessingIndex(index);
      setReviewOpen(true);
    } catch (err) {
      toast({
        title: `Couldn't generate tasks for "${draft.title}"`,
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
      processGoal(index + 1);
    }
  }

  async function handleReviewConfirm(selected: BreakdownSuggestion[]) {
    if (selected.length > 0 && currentGoalId && profile) {
      const { error: insertError } = await supabase.from('tasklog_tasks').insert(
        selected.map((s) => ({
          profileId: profile.id,
          goalId: currentGoalId,
          title: s.title,
          notes: s.description || null,
          category: s.category,
          priority: s.priority,
          dueDate: s.suggestedDueDate || null,
          tags: [currentGoalTitle],
        }))
      );
      if (insertError) {
        toast({ title: 'Could not save tasks', description: insertError.message, variant: 'destructive' });
      } else {
        setTaskCount((prev) => prev + selected.length);
      }
    }
    setReviewOpen(false);
    processGoal(processingIndex + 1);
  }

  function handleStart() {
    setStep('goals');
  }

  function handleSkip() {
    router.replace(returnTo);
  }

  function handleGoalsContinue() {
    setStep('breakdown');
    processGoal(0);
  }

  function handleFinish() {
    router.replace(returnTo);
  }

  if (profileLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={handleStart} onSkip={handleSkip} />;
  }
  if (step === 'goals') {
    return (
      <GoalEntryStep
        goals={goalDrafts}
        onAdd={(goal) => setGoalDrafts((prev) => [...prev, goal])}
        onRemove={(index) => setGoalDrafts((prev) => prev.filter((_, i) => i !== index))}
        onContinue={handleGoalsContinue}
      />
    );
  }
  if (step === 'breakdown') {
    return (
      <>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm text-muted-foreground">Setting up your goals…</p>
        </div>
        <BreakdownReviewSheet
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          suggestions={suggestions}
          onConfirm={handleReviewConfirm}
        />
      </>
    );
  }
  return <DoneStep goalCount={goalCount} taskCount={taskCount} finishLabel={finishLabel} onFinish={handleFinish} />;
}
