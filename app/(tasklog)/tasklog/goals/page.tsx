// app/(tasklog)/tasklog/goals/page.tsx
'use client';

import useSWR from 'swr';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskGoalRow } from '@/lib/tasklog/types';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { AddGoalForm } from './_components/AddGoalForm';
import { GoalCard } from './_components/GoalCard';

export default function GoalsPage() {
  const supabase = createClientComponentClient();
  const { profile } = useCurrentProfile();

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

  return (
    <div className="pb-24">
      <TopBar title="Goals" />
      <div className="flex flex-col gap-4 px-4 py-4">
        {profile && <AddGoalForm profileId={profile.id} onGoalAdded={handleGoalAdded} />}
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No goals yet. Add one above.</p>
        ) : (
          goals.map((goal) => <GoalCard key={goal.id} goal={goal} />)
        )}
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
