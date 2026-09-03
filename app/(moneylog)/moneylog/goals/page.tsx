// app/(moneylog)/moneylog/goals/page.tsx
'use client';

import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import { AddFinancialGoalForm } from './_components/AddFinancialGoalForm';
import { FinancialGoalsList } from './_components/FinancialGoalsList';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { financialGoalsQuery } from '@/lib/moneylog/queries';
import { useToast } from '@/components/ui/use-toast';

// Client Component — cannot export `metadata`; page title is set via TopBar below.
export default function FinancialGoalsPage() {
  const { toast } = useToast();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const profileId = profile?.id ?? null;

  const { data: goals = [], isLoading: goalsLoading, mutate: mutateGoals } = useSWR<FinancialGoalRow[]>(
    profile ? financialGoalsQuery(profile.id).key : null,
    profile ? financialGoalsQuery(profile.id).fetcher : null,
    {
      onError: (error) => {
        toast({ title: 'Failed to load goals', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      },
    }
  );
  const loading = profileLoading || goalsLoading;

  function handleGoalAdded(goal: FinancialGoalRow) {
    mutateGoals([goal, ...goals], { revalidate: false });
  }

  function handleGoalUpdated(goal: FinancialGoalRow) {
    mutateGoals(goals.map((g) => (g.id === goal.id ? goal : g)), { revalidate: false });
  }

  return (
    <div className="pb-24">
      <TopBar title="Financial Goals" />
      <div className="px-4 py-4 flex flex-col gap-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <FinancialGoalsList goals={goals} profileId={profileId} onGoalUpdated={handleGoalUpdated} />
        )}
        {profileId && <AddFinancialGoalForm profileId={profileId} onGoalAdded={handleGoalAdded} />}
      </div>
      <MoneyLogBottomNav />
    </div>
  );
}
