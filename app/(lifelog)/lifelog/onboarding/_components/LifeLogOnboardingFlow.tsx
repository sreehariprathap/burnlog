// app/(lifelog)/lifelog/onboarding/_components/LifeLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { WelcomeStep } from './WelcomeStep';
import { IncomeSourcesStep } from './IncomeSourcesStep';
import { FixedExpensesStep } from './FixedExpensesStep';
import { ReviewStep } from './ReviewStep';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

type Step = 'welcome' | 'income' | 'expenses' | 'review';

export function LifeLogOnboardingFlow() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState<Step>('welcome');
  const [incomeRows, setIncomeRows] = useState<RecurringItemDraft[]>([]);
  const [expenseRows, setExpenseRows] = useState<RecurringItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleSkipAll() {
    router.replace('/lifelog');
  }

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) throw new Error('Profile not found');

      const rows = [...incomeRows, ...expenseRows];
      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('recurring_items')
          .insert(rows.map((row) => ({ ...row, profileId: profile.id })));
        if (insertError) throw insertError;
      }

      router.replace('/lifelog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={() => setStep('income')} onSkip={handleSkipAll} />;
  }
  if (step === 'income') {
    return (
      <IncomeSourcesStep
        rows={incomeRows}
        onAdd={(draft) => setIncomeRows((prev) => [...prev, draft])}
        onRemove={(index) => setIncomeRows((prev) => prev.filter((_, i) => i !== index))}
        onContinue={() => setStep('expenses')}
        onSkip={() => setStep('expenses')}
      />
    );
  }
  if (step === 'expenses') {
    return (
      <FixedExpensesStep
        rows={expenseRows}
        onAdd={(draft) => setExpenseRows((prev) => [...prev, draft])}
        onRemove={(index) => setExpenseRows((prev) => prev.filter((_, i) => i !== index))}
        onContinue={() => setStep('review')}
        onSkip={() => setStep('review')}
      />
    );
  }
  return (
    <ReviewStep
      incomeRows={incomeRows}
      expenseRows={expenseRows}
      saving={saving}
      error={error}
      onConfirm={handleConfirm}
      onBack={() => setStep('expenses')}
    />
  );
}
