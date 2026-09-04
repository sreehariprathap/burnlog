// app/(homelog)/homelog/onboarding/_components/HomeLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { APPS, isAppId } from '@/lib/appMode';
import { WelcomeStep } from './WelcomeStep';
import { HouseholdSetupStep } from './HouseholdSetupStep';
import { ChoreSuggestionReviewSheet, type ChoreSuggestion } from './ChoreSuggestionReviewSheet';
import { DoneStep } from './DoneStep';

type Step = 'welcome' | 'household' | 'chores' | 'done';

export function HomeLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/homelog';
  // When the onboarding sequence router sent us here, it tells us which app
  // comes next so the "done" screen can point at the real next step instead
  // of always naming this app.
  const nextAppParam = searchParams.get('nextApp');
  const isLastStep = searchParams.get('lastStep') === '1';
  const finishLabel = isAppId(nextAppParam)
    ? `Go to ${APPS[nextAppParam].name}`
    : isLastStep
      ? 'Finish setup'
      : 'Go to HomeLog';
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('welcome');
  const [suggestions, setSuggestions] = useState<ChoreSuggestion[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [choreCount, setChoreCount] = useState(0);

  function handleStart() {
    setStep('household');
  }

  function handleSkip() {
    router.replace(returnTo);
  }

  async function handleCreated(household: { id: string; name: string }) {
    setStep('chores');
    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/ai/homelog/suggest-chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdName: household.name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to generate chore suggestions');
      setSuggestions(body.chores);
      setReviewOpen(true);
    } catch (err) {
      toast({
        title: "Couldn't generate chore suggestions",
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
      setStep('done');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function handleJoined() {
    setStep('done');
  }

  async function handleReviewConfirm(selected: ChoreSuggestion[]) {
    let created = 0;
    for (const chore of selected) {
      const res = await fetch('/api/homelog/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chore.title,
          category: chore.category,
          frequency: chore.frequency,
          dayOfWeek: chore.dayOfWeek,
          dayOfMonth: null,
          monthOfYear: null,
          dueDate: new Date().toISOString().slice(0, 10),
        }),
      });
      if (res.ok) created += 1;
    }
    setChoreCount(created);
    setReviewOpen(false);
    setStep('done');
  }

  function handleFinish() {
    router.replace(returnTo);
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={handleStart} onSkip={handleSkip} />;
  }
  if (step === 'household') {
    return <HouseholdSetupStep onCreated={handleCreated} onJoined={handleJoined} />;
  }
  if (step === 'chores') {
    return (
      <>
        {loadingSuggestions && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm text-muted-foreground">Thinking of some starter chores…</p>
          </div>
        )}
        <ChoreSuggestionReviewSheet
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          suggestions={suggestions}
          onConfirm={handleReviewConfirm}
        />
      </>
    );
  }
  return <DoneStep choreCount={choreCount} finishLabel={finishLabel} onFinish={handleFinish} />;
}
