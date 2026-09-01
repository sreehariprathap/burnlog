// app/(tasklog)/tasklog/page.tsx
// Client Component — metadata is exported from a server layout/page elsewhere; not applicable here.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { CheckIcon, FlameIcon, RefreshCwIcon } from 'lucide-react';
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
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import type { StreakProfile } from '@/lib/tasklog/streak';
import { useToast } from '@/components/ui/use-toast';
import { formatRelative } from '@/lib/format';

function TodayTaskRow({ task, onToggle }: { task: TaskRow; onToggle: () => void }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <Checkbox
          checked={!!task.completedAt}
          onCheckedChange={onToggle}
          aria-label={task.completedAt ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
        />
        <div className="flex-1">
          <p className={`text-sm ${task.completedAt ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p>
          {task.dueDate && !task.completedAt && (
            <p className="text-xs text-muted-foreground">Due {task.dueDate}</p>
          )}
          {task.completedAt && (
            <p className="text-xs text-muted-foreground">Completed {formatRelative(task.completedAt)}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function toStreakProfile(profileId: string, profile: Record<string, unknown>): StreakProfile {
  return {
    id: profileId,
    taskLogCurrentStreak: Number(profile.taskLogCurrentStreak ?? 0),
    taskLogLongestStreak: Number(profile.taskLogLongestStreak ?? 0),
    lastTaskLogStreakDate: (profile.lastTaskLogStreakDate as string | null) ?? null,
  };
}

export default function TaskLogDashboardPage() {
  const supabase = createClient();
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<TaskRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const today = todayDateString();

  const {
    data: todayTasks,
    isLoading,
    mutate: refreshToday,
  } = useSWR(profile ? ['tasklog-today', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profile!.id)
      .or(`dueDate.eq.${today},plannedForToday.eq.true`)
      .order('dueDate', { ascending: true });
    return (data as TaskRow[]) || [];
  });

  const tasks = todayTasks ?? [];
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.completedAt);
  const dueToday = tasks.filter((t) => !(t.dueDate && t.dueDate < today));
  const doneCount = tasks.filter((t) => t.completedAt).length;

  async function handleToggle(task: TaskRow) {
    if (!profile) return;
    const completed = !task.completedAt;
    await refreshToday(
      tasks.map((t) => (t.id === task.id ? { ...t, completedAt: completed ? new Date().toISOString() : null } : t)),
      { revalidate: false }
    );
    try {
      await markTaskComplete(
        supabase,
        { id: task.id, goalId: task.goalId, title: task.title, cost: task.cost, costCategory: task.costCategory, costLoggedAt: task.costLoggedAt },
        toStreakProfile(profile.id, profile),
        completed
      );
      if (completed) {
        await refreshCurrentProfile();
        toast({ title: 'Task completed', description: `"${task.title}" marked as done.` });
      }
    } catch (err) {
      toast({
        title: 'Failed to update task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      await refreshToday();
    }
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await refreshToday();
    } finally {
      setRefreshing(false);
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
    try {
      const { error } = await supabase.from('tasklog_tasks').update({ plannedForToday: true }).eq('id', taskId);
      if (error) throw error;
      setPickerCandidates((prev) => prev.filter((t) => t.id !== taskId));
      await refreshToday();
      toast({ title: 'Added to today' });
    } catch (err) {
      toast({
        title: 'Failed to plan task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Dashboard"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh tasks"
            onClick={handleManualRefresh}
            disabled={refreshing}
          >
            <RefreshCwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        }
      />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <FlameIcon className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">{Number(profile?.taskLogCurrentStreak ?? 0)} day streak</p>
            <p className="text-xs text-muted-foreground">Best: {Number(profile?.taskLogLongestStreak ?? 0)}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{doneCount}/{tasks.length} done today</p>
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
        {isLoading ? (
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
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
                  <span className="text-2xl" aria-hidden="true">🌤️</span>
                  <p className="text-sm font-semibold">Nothing planned for today</p>
                  <p className="text-xs text-muted-foreground">Add a task or plan your day to get started.</p>
                  <Button type="button" variant="outline" size="sm" onClick={openPlanMyDay} className="mt-1">
                    Plan my day
                  </Button>
                </div>
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
                  aria-label={`Add "${task.title}" to today`}
                  className="flex items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-accent"
                >
                  {task.title}
                  <CheckIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
