// app/(moneylog)/moneylog/goals/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import { AddFinancialGoalForm } from './_components/AddFinancialGoalForm';
import { FinancialGoalsList } from './_components/FinancialGoalsList';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';

export default function FinancialGoalsPage() {
  const supabase = createClientComponentClient();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [goals, setGoals] = useState<FinancialGoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(
    async (id: string) => {
      setLoading(true);
      const { data } = await supabase
        .from('financial_goals')
        .select('*')
        .eq('profileId', id)
        .order('createdAt', { ascending: false });
      setGoals((data as FinancialGoalRow[]) || []);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      fetchGoals(profile.id);
    })();
  }, [supabase, fetchGoals]);

  function handleGoalAdded(goal: FinancialGoalRow) {
    setGoals((prev) => [goal, ...prev]);
  }

  return (
    <div className="pb-24">
      <TopBar title="Financial Goals" />
      <div className="px-4 py-4 flex flex-col gap-4">
        {loading ? <Skeleton className="h-40 w-full" /> : <FinancialGoalsList goals={goals} profileId={profileId} />}
        {profileId && <AddFinancialGoalForm profileId={profileId} onGoalAdded={handleGoalAdded} />}
      </div>
      <MoneyLogBottomNav />
    </div>
  );
}
