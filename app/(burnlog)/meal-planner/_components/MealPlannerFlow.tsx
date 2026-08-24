// app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { StoreStep } from './StoreStep';
import type { LifestyleAnswers, MealPlannerWizardAnswers } from '@/lib/ai/types';

export type WizardStep = 'loading' | 'store' | 'household' | 'preferences' | 'appliances' | 'generating-candidates' | 'selecting' | 'grid' | 'finalizing' | 'grocery' | 'shopping' | 'done';

export function MealPlannerFlow() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [step, setStep] = useState<WizardStep>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [answers, setAnswers] = useState<Partial<MealPlannerWizardAnswers>>({});
  const [error, setError] = useState<string | null>(null);

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
      const lifestyle = (profile.lifestyle ?? null) as LifestyleAnswers | null;
      setInitialLifestyle(lifestyle);
      setAnswers((prev) => ({
        ...prev,
        mealsPerDay: lifestyle?.nutrition?.mealsPerDay ?? 3,
        householdSize: lifestyle?.mealPlanning?.householdSize ?? 1,
        cookMode: lifestyle?.mealPlanning?.cookMode ?? 'fresh_daily',
        cuisinePreferences: lifestyle?.mealPlanning?.cuisinePreferences ?? [],
        surpriseMe: lifestyle?.mealPlanning?.surpriseMe ?? false,
        appliances: lifestyle?.mealPlanning?.kitchenAppliances ?? [],
      }));
      setStep('store');
    })();
  }, [supabase, router]);

  if (step === 'loading' || !profileId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 z-10">
          {error}
        </div>
      )}

      {step === 'store' && (
        <StoreStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('household');
          }}
        />
      )}

      {step === 'household' && (
        <div className="text-sm text-muted-foreground">Household step coming in Task 6…</div>
      )}
    </div>
  );
}
