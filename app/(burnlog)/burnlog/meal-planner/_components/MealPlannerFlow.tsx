// app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, PartyPopper } from 'lucide-react';
import { StoreStep } from './StoreStep';
import { HouseholdStep } from './HouseholdStep';
import { PreferencesStep } from './PreferencesStep';
import { AppliancesStep } from './AppliancesStep';
import { MealSelectionStep } from './MealSelectionStep';
import { WeekGridStep } from './WeekGridStep';
import { GroceryListStep } from './GroceryListStep';
import { ShoppingDayStep } from './ShoppingDayStep';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AiLoading } from '@/components/kokonutui/ai-loading';
import { useToast } from '@/components/ui/use-toast';
import type { LifestyleAnswers, MealPlannerWizardAnswers, MealCandidate, MealGridCell } from '@/lib/ai/types';

export type WizardStep = 'loading' | 'store' | 'household' | 'preferences' | 'appliances' | 'generating-candidates' | 'selecting' | 'grid' | 'finalizing' | 'grocery' | 'shopping' | 'done';

export function MealPlannerFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<WizardStep>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [initialLifestyle, setInitialLifestyle] = useState<LifestyleAnswers | null>(null);
  const [answers, setAnswers] = useState<Partial<MealPlannerWizardAnswers>>({});
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MealCandidate[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<MealCandidate[]>([]);
  const [grid, setGrid] = useState<MealGridCell[]>([]);
  const [groceryList, setGroceryList] = useState<Record<string, string[]> | null>(null);
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const { toast } = useToast();

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

      // A search deep-link (e.g. "set your favorite meals") jumps straight
      // to the preferences step, skipping store/household — those need a
      // safe fallback since there's no way to revisit them later in this
      // wizard.
      const jumpToPreferences = searchParams.get('step') === 'preferences';

      setAnswers((prev) => ({
        ...prev,
        ...(jumpToPreferences ? { store: 'Other', onHandIngredients: [] } : {}),
        mealsPerDay: lifestyle?.nutrition?.mealsPerDay ?? 3,
        householdSize: lifestyle?.mealPlanning?.householdSize ?? 1,
        cookMode: lifestyle?.mealPlanning?.cookMode ?? 'fresh_daily',
        cuisinePreferences: lifestyle?.mealPlanning?.cuisinePreferences ?? [],
        surpriseMe: lifestyle?.mealPlanning?.surpriseMe ?? false,
        appliances: lifestyle?.mealPlanning?.kitchenAppliances,
      }));
      setStep(jumpToPreferences ? 'preferences' : 'store');
    })();
  }, [supabase, router, searchParams]);

  useEffect(() => {
    if (step !== 'generating-candidates') return;
    (async () => {
      setError(null);
      try {
        const res = await fetch('/api/ai/meal-plan/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          const message = data.error ?? 'Failed to generate meal ideas. Please try again.';
          setError(message);
          toast({ title: 'Could not generate meal ideas', description: message, variant: 'destructive' });
          setStep('appliances');
          return;
        }
        setCandidates(data.candidates as MealCandidate[]);
        setStep('selecting');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        setError(message);
        toast({ title: 'Could not generate meal ideas', description: message, variant: 'destructive' });
        setStep('appliances');
      }
    })();
  }, [step, answers, toast]);

  useEffect(() => {
    if (step !== 'finalizing') return;
    (async () => {
      setError(null);
      try {
        const res = await fetch('/api/ai/meal-plan/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid, answers }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          const message = data.error ?? 'Failed to finalize your plan. Please try again.';
          setError(message);
          toast({ title: 'Could not finalize your plan', description: message, variant: 'destructive' });
          setStep('grid');
          return;
        }
        setGroceryList(data.groceryList);
        setEstimatedBudget(data.estimatedBudget ?? '');
        setStep('grocery');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        setError(message);
        toast({ title: 'Could not finalize your plan', description: message, variant: 'destructive' });
        setStep('grid');
      }
    })();
  }, [step, grid, answers, toast]);

  if (step === 'loading' || !profileId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
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
        <HouseholdStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('preferences');
          }}
        />
      )}

      {step === 'preferences' && (
        <PreferencesStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('appliances');
          }}
        />
      )}

      {step === 'appliances' && (
        <AppliancesStep
          initialAnswers={answers}
          onContinue={(partial) => {
            setAnswers((prev) => ({ ...prev, ...partial }));
            setStep('generating-candidates');
          }}
        />
      )}

      {step === 'generating-candidates' && (
        <AiLoading tasks={["Reviewing your preferences", "Thinking up meal ideas", "Balancing macros", "Almost ready"]} />
      )}

      {step === 'selecting' && (
        <MealSelectionStep
          candidates={candidates}
          cookMode={answers.cookMode ?? 'fresh_daily'}
          mealsPerDay={answers.mealsPerDay ?? 3}
          onContinue={(selected) => {
            setSelectedMeals(selected);
            setStep('grid');
          }}
        />
      )}

      {step === 'grid' && (
        <WeekGridStep
          selected={selectedMeals}
          mealsPerDay={answers.mealsPerDay ?? 3}
          onConfirm={(confirmedGrid) => {
            setGrid(confirmedGrid);
            setStep('finalizing');
          }}
        />
      )}

      {step === 'finalizing' && (
        <AiLoading tasks={["Building your grocery list", "Estimating your budget", "Saving your plan"]} />
      )}

      {step === 'grocery' && groceryList && (
        <GroceryListStep
          groceryList={groceryList}
          estimatedBudget={estimatedBudget}
          onContinue={() => setStep('shopping')}
        />
      )}

      {step === 'shopping' && (
        <ShoppingDayStep profileId={profileId} onDone={() => setStep('done')} />
      )}

      {step === 'done' && (
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 space-y-4">
            <p className="text-lg font-medium flex items-center justify-center gap-2"><PartyPopper className="w-5 h-5" />Your week is planned!</p>
            <Button onClick={() => router.push('/burnlog/session')}>Go to Plan</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
