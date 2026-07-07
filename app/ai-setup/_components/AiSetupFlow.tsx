'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsentStep } from './ConsentStep';
import { LifestyleForm } from './LifestyleForm';
import { GoalsStep, type GoalEntry } from './GoalsStep';
import { ActivityPreferencesStep } from './ActivityPreferencesStep';
import { EquipmentStep } from './EquipmentStep';
import { NutritionStep } from './NutritionStep';
import { PlanPreview } from './PlanPreview';
import type {
  LifestyleAnswers,
  WorkoutPlanEntry,
  ActivityPreferences,
  EquipmentAnswers,
  NutritionAnswers,
} from '@/lib/ai/types';

const ORDERED_PAGE_KEYS = ['goals', 'activity_preferences', 'equipment', 'nutrition'] as const;
type PageKey = (typeof ORDERED_PAGE_KEYS)[number];

type Step = 'loading' | 'consent' | 'questionnaire' | PageKey | 'generating' | 'preview' | 'error';

export function AiSetupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/dashboard';
  const supabase = createClientComponentClient();

  const [step, setStep] = useState<Step>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleAnswers | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<PageKey[]>([]);
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [activityPreferences, setActivityPreferences] = useState<ActivityPreferences | undefined>(undefined);
  const [equipment, setEquipment] = useState<EquipmentAnswers | undefined>(undefined);
  const [nutrition, setNutrition] = useState<NutritionAnswers | undefined>(undefined);
  const [plan, setPlan] = useState<WorkoutPlanEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, lifestyle')
        .eq('userId', user.id)
        .single();

      if (!profile) {
        router.replace('/signup/profile');
        return;
      }
      setProfileId(profile.id);
      setInitialLifestyle(profile.lifestyle ?? null);

      const { data: flags } = await supabase
        .from('onboarding_page_flags')
        .select('pageKey, isEnabled');
      const enabledSet = new Set(
        (flags ?? []).filter((f) => f.isEnabled).map((f) => f.pageKey)
      );
      setEnabledKeys(ORDERED_PAGE_KEYS.filter((k) => enabledSet.has(k)));

      setStep('consent');
    })();
  }, [supabase, router]);

  const requestPlan = async (answers: LifestyleAnswers) => {
    setErrorMessage(null);
    try {
      const response = await fetch('/api/ai/workout-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Failed to generate a plan');
      }
      setPlan(body.plan as WorkoutPlanEntry[]);
      setStep('preview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate a plan');
      setStep('error');
    }
  };

  const stepAfter = (current: Step): Step => {
    if (current === 'questionnaire') {
      return enabledKeys[0] ?? 'generating';
    }
    const idx = enabledKeys.indexOf(current as PageKey);
    return enabledKeys[idx + 1] ?? 'generating';
  };

  const advanceFrom = async (current: PageKey) => {
    const next = stepAfter(current);
    if (next === 'generating') {
      setStep('generating');
      if (lifestyle) await requestPlan(lifestyle);
    } else {
      setStep(next);
    }
  };

  const handleQuestionnaireSubmit = async (answers: LifestyleAnswers) => {
    setLifestyle(answers);
    const next = stepAfter('questionnaire');
    if (next === 'generating') {
      setStep('generating');
      await requestPlan(answers);
    } else {
      setStep(next);
    }
  };

  const handleGoalsContinue = (entries: GoalEntry[]) => {
    setGoals(entries);
    advanceFrom('goals');
  };

  const handleGoalsSkip = () => {
    advanceFrom('goals');
  };

  const handleActivityContinue = (answers: ActivityPreferences) => {
    setActivityPreferences(answers);
    advanceFrom('activity_preferences');
  };

  const handleActivitySkip = () => {
    advanceFrom('activity_preferences');
  };

  const handleEquipmentContinue = (answers: EquipmentAnswers) => {
    setEquipment(answers);
    advanceFrom('equipment');
  };

  const handleEquipmentSkip = () => {
    advanceFrom('equipment');
  };

  const handleNutritionContinue = (answers: NutritionAnswers) => {
    setNutrition(answers);
    advanceFrom('nutrition');
  };

  const handleNutritionSkip = () => {
    advanceFrom('nutrition');
  };

  const handleRegenerate = async () => {
    if (!lifestyle) return;
    setRegenerating(true);
    await requestPlan(lifestyle);
    setRegenerating(false);
  };

  const handleRetry = async () => {
    if (!lifestyle) return;
    setStep('generating');
    await requestPlan(lifestyle);
  };

  const handleSkip = () => {
    router.push(returnTo);
  };

  const handleSave = async () => {
    if (!plan || !profileId || !lifestyle) return;
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

      const fullLifestyle: LifestyleAnswers = {
        ...lifestyle,
        ...(activityPreferences && { activityPreferences }),
        ...(equipment && { equipment }),
        ...(nutrition && { nutrition }),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ aiEnabled: true, lifestyle: fullLifestyle })
        .eq('id', profileId);
      if (profileError) throw profileError;

      if (goals.length > 0) {
        const goalRows = goals.map((g) => ({
          profileId,
          goalType: g.goalType,
          targetValue: g.targetValue,
        }));
        const { error: goalsError } = await supabase.from('fitness_goals').insert(goalRows);
        if (goalsError) throw goalsError;
      }

      router.push(returnTo);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save your plan');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      {step === 'consent' && (
        <ConsentStep onAccept={() => setStep('questionnaire')} onDecline={handleSkip} />
      )}

      {step === 'questionnaire' && (
        <LifestyleForm
          submitting={false}
          initialAnswers={initialLifestyle}
          onSubmit={handleQuestionnaireSubmit}
        />
      )}

      {step === 'goals' && (
        <GoalsStep onContinue={handleGoalsContinue} onSkip={handleGoalsSkip} />
      )}

      {step === 'activity_preferences' && (
        <ActivityPreferencesStep onContinue={handleActivityContinue} onSkip={handleActivitySkip} />
      )}

      {step === 'equipment' && (
        <EquipmentStep onContinue={handleEquipmentContinue} onSkip={handleEquipmentSkip} />
      )}

      {step === 'nutrition' && (
        <NutritionStep onContinue={handleNutritionContinue} onSkip={handleNutritionSkip} />
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin h-8 w-8" />
          <p className="text-sm text-muted-foreground">Generating your personalized plan…</p>
        </div>
      )}

      {step === 'preview' && plan && (
        <PlanPreview
          plan={plan}
          saving={saving}
          regenerating={regenerating}
          onChange={setPlan}
          onSave={handleSave}
          onRegenerate={handleRegenerate}
          onCancel={handleSkip}
        />
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleSkip}>Skip for now</Button>
            <Button onClick={handleRetry}>Try Again</Button>
          </div>
        </div>
      )}
    </div>
  );
}
