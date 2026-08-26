// app/(tasklog)/tasklog/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CheckIcon, FlameIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { todayDateString, type TaskRow } from '@/lib/tasklog/types';
import { markTaskComplete } from '@/lib/tasklog/completeTask';
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';

type ProfileRow = {
  id: string;
  taskLogCurrentStreak: number;
  taskLogLongestStreak: number;
  lastTaskLogStreakDate: string | null;
};

function TodayTaskRow({ task, onToggle }: { task: TaskRow; onToggle: () => void }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <Checkbox checked={!!task.completedAt} onCheckedChange={onToggle} />
        <p className={`text-sm ${task.completedAt ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p>
      </CardContent>
    </Card>
  );
}

export default function TaskLogDashboardPage() {
  const supabase = createClientComponentClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchToday = useCallback(async (profileId: string) => {
    setLoading(true);
    const today = todayDateString();
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profileId)
      .or(`dueDate.eq.${today},plannedForToday.eq.true`)
      .order('dueDate', { ascending: true });
    setTodayTasks((data as TaskRow[]) || []);
    setLoading(false);
  }, [supabase]);

  const fetchProfileAndToday = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, taskLogCurrentStreak, taskLogLongestStreak, lastTaskLogStreakDate')
      .eq('userId', user.id)
      .single();
    if (!profileRow) { setLoading(false); return; }
    setProfile(profileRow as ProfileRow);
    await fetchToday(profileRow.id);
  }, [supabase, fetchToday]);

  useEffect(() => { fetchProfileAndToday(); }, [fetchProfileAndToday]);

  const today = todayDateString();
  const overdue = todayTasks.filter((t) => t.dueDate && t.dueDate < today && !t.completedAt);
  const dueToday = todayTasks.filter((t) => !(t.dueDate && t.dueDate < today));
  const doneCount = todayTasks.filter((t) => t.completedAt).length;

  async function handleToggle(task: TaskRow) {
    if (!profile) return;
    const completed = !task.completedAt;
    setTodayTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completedAt: completed ? new Date().toISOString() : null } : t))
    );
    await markTaskComplete(supabase, { id: task.id, goalId: task.goalId }, profile, completed);
    if (completed) {
      const { data: refreshedProfile } = await supabase
        .from('profiles')
        .select('id, taskLogCurrentStreak, taskLogLongestStreak, lastTaskLogStreakDate')
        .eq('id', profile.id)
        .single();
      if (refreshedProfile) setProfile(refreshedProfile as ProfileRow);
    }
  }

  async function openPlanMyDay() {
    if (!profile) return;
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profile.id)
      .is('completedAt', null)
      .eq('plannedForToday', false)
      .or(`dueDate.is.null,dueDate.neq.${today}`);
    setPickerCandidates((data as TaskRow[]) || []);
    setPickerOpen(true);
  }

  async function handlePickForToday(taskId: string) {
    await supabase.from('tasklog_tasks').update({ plannedForToday: true }).eq('id', taskId);
    setPickerCandidates((prev) => prev.filter((t) => t.id !== taskId));
    if (profile) await fetchToday(profile.id);
  }

  return (
    <div className="pb-24">
      <TopBar title="Dashboard" />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <FlameIcon className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">{profile?.taskLogCurrentStreak ?? 0} day streak</p>
            <p className="text-xs text-muted-foreground">Best: {profile?.taskLogLongestStreak ?? 0}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{doneCount}/{todayTasks.length} done today</p>
      </div>

      {profile && (
        <div className="px-4 pb-3">
          <CrossAppSnapshot currentApp="tasklog" profileId={profile.id} />
        </div>
      )}

      <div className="px-4">
        <Button type="button" variant="outline" size="sm" onClick={openPlanMyDay}>
          Plan my day
        </Button>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {overdue.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-destructive">Overdue</p>
                {overdue.map((task) => (
                  <TodayTaskRow key={task.id} task={task} onToggle={() => handleToggle(task)} />
                ))}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">Today</p>
              {dueToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing planned for today yet.</p>
              ) : (
                dueToday.map((task) => <TodayTaskRow key={task.id} task={task} onToggle={() => handleToggle(task)} />)
              )}
            </div>
          </>
        )}
      </div>

      <Drawer open={pickerOpen} onOpenChange={setPickerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Plan my day</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 p-4 pb-8">
            {pickerCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other open tasks to pull in.</p>
            ) : (
              pickerCandidates.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handlePickForToday(task.id)}
                  className="flex items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-accent"
                >
                  {task.title}
                  <CheckIcon className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <TaskLogBottomNav />
    </div>
  );
}
