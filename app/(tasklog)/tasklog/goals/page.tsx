// app/(tasklog)/tasklog/goals/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskGoalRow } from '@/lib/tasklog/types';
import { AddGoalForm } from './_components/AddGoalForm';

type ProfileRow = { id: string };

export default function GoalsPage() {
  const supabase = createClientComponentClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [goals, setGoals] = useState<TaskGoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async (profileId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('task_goals')
      .select('*')
      .eq('profileId', profileId)
      .order('createdAt', { ascending: false });
    setGoals((data as TaskGoalRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profileRow) return;
      setProfile(profileRow as ProfileRow);
      await fetchGoals(profileRow.id);
    })();
  }, [supabase, fetchGoals]);

  function handleGoalAdded(goal: TaskGoalRow) {
    setGoals((prev) => [goal, ...prev]);
  }

  return (
    <div className="pb-24">
      <TopBar title="Goals" />
      <div className="flex flex-col gap-4 px-4 py-4">
        {profile && <AddGoalForm profileId={profile.id} onGoalAdded={handleGoalAdded} />}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No goals yet. Add one above.</p>
        ) : (
          <p className="text-sm text-muted-foreground">{goals.length} goal(s) — cards render once GoalCard lands.</p>
        )}
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
