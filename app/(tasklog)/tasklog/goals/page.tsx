// app/(tasklog)/tasklog/goals/page.tsx
// Client Component — no static `metadata` export possible here.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, RefreshCwIcon } from 'lucide-react';
import type { TaskGoalRow } from '@/lib/tasklog/types';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalCard } from './_components/GoalCard';

export default function GoalsPage() {
  const supabase = createClient();
  const { profile } = useCurrentProfile();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: goalData,
    isLoading,
    mutate: mutateGoals,
  } = useSWR(profile ? ['tasklog-goals', profile.id] : null, async () => {
    const { data } = await supabase
      .from('task_goals')
      .select('*')
      .eq('profileId', profile!.id)
      .order('createdAt', { ascending: false });
    return (data as TaskGoalRow[]) || [];
  });

  const goals = goalData ?? [];

  async function handleGoalAdded(goal: TaskGoalRow) {
    await mutateGoals([goal, ...goals], { revalidate: false });
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await mutateGoals();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Goals"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh goals"
            onClick={handleManualRefresh}
            disabled={refreshing}
          >
            <RefreshCwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-4">
        {profile && <AddGoalForm profileId={profile.id} onGoalAdded={handleGoalAdded} />}
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
            <Target className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">No goals yet</p>
            <p className="text-xs text-muted-foreground">Add a goal above to start breaking it into tasks.</p>
          </div>
        ) : (
          goals.map((goal) => <GoalCard key={goal.id} goal={goal} />)
        )}
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
