'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { LANES, type TaskLane, type TaskRow } from '@/lib/tasklog/types';
import { markTaskComplete } from '@/lib/tasklog/completeTask';
import { boardTasksQuery } from '@/lib/tasklog/queries';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import type { StreakProfile } from '@/lib/tasklog/streak';
import { TaskCard } from './TaskCard';
import { TaskDetailSheet } from './TaskDetailSheet';
import { BoardColumn } from './BoardColumn';

function toStreakProfile(profileId: string, profile: Record<string, unknown>): StreakProfile {
  return {
    id: profileId,
    taskLogCurrentStreak: Number(profile.taskLogCurrentStreak ?? 0),
    taskLogLongestStreak: Number(profile.taskLogLongestStreak ?? 0),
    lastTaskLogStreakDate: (profile.lastTaskLogStreakDate as string | null) ?? null,
  };
}

export function BoardContent() {
  const supabase = createClient();
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [detailTask, setDetailTask] = useState<TaskRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const {
    data: taskData,
    isLoading,
    mutate: mutateTasks,
  } = useSWR(
    profile ? boardTasksQuery(profile.id).key : null,
    profile ? boardTasksQuery(profile.id).fetcher : null
  );

  const tasks = taskData ?? [];

  function tasksInLane(lane: TaskLane): TaskRow[] {
    return tasks.filter((t) => t.lane === lane);
  }

  function findLaneOfTask(id: string): TaskLane | null {
    return (tasks.find((t) => t.id === id)?.lane as TaskLane | undefined) ?? null;
  }

  async function setTasksOptimistic(next: TaskRow[]) {
    await mutateTasks(next, { revalidate: false });
  }

  async function persistLanePositions(lane: TaskLane, ordered: TaskRow[]) {
    await Promise.all(
      ordered.map((t, index) => supabase.from('tasklog_tasks').update({ lane, position: index }).eq('id', t.id))
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceLane = findLaneOfTask(activeId);
    if (!sourceLane) return;
    const destLane = (LANES.some((l) => l.id === overId) ? overId : findLaneOfTask(overId)) as TaskLane | null;
    if (!destLane) return;

    if (sourceLane === destLane) {
      const laneTasks = tasksInLane(sourceLane);
      const oldIndex = laneTasks.findIndex((t) => t.id === activeId);
      const newIndex = laneTasks.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const reordered = arrayMove(laneTasks, oldIndex, newIndex);
      await setTasksOptimistic([...tasks.filter((t) => t.lane !== sourceLane), ...reordered]);
      await persistLanePositions(sourceLane, reordered);
      return;
    }

    const movedTask = tasks.find((t) => t.id === activeId);
    if (!movedTask) return;
    const sourceTasks = tasksInLane(sourceLane).filter((t) => t.id !== activeId);
    const destTasks = tasksInLane(destLane);
    const updatedMoved = { ...movedTask, lane: destLane };
    const insertIndex = destTasks.findIndex((t) => t.id === overId);
    const newDestTasks =
      insertIndex === -1
        ? [...destTasks, updatedMoved]
        : [...destTasks.slice(0, insertIndex), updatedMoved, ...destTasks.slice(insertIndex)];

    await setTasksOptimistic([
      ...tasks.filter((t) => t.lane !== sourceLane && t.lane !== destLane),
      ...sourceTasks,
      ...newDestTasks,
    ]);

    await persistLanePositions(sourceLane, sourceTasks);
    await persistLanePositions(destLane, newDestTasks);

    if (destLane === 'done' && profile) {
      try {
        await markTaskComplete(
          supabase,
          { id: movedTask.id, goalId: movedTask.goalId, title: movedTask.title, cost: movedTask.cost, costCategory: movedTask.costCategory, costLoggedAt: movedTask.costLoggedAt },
          toStreakProfile(profile.id, profile),
          true
        );
        await refreshCurrentProfile();
        toast({ title: 'Task completed', description: `"${movedTask.title}" marked as done.` });
      } catch (err) {
        toast({
          title: 'Failed to complete task',
          description: err instanceof Error ? err.message : 'Something went wrong.',
          variant: 'destructive',
        });
      }
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !profile) return;
    setAddingTask(true);
    try {
      const todoTasks = tasksInLane('todo');
      const { data, error } = await supabase
        .from('tasklog_tasks')
        .insert([{
          profileId: profile.id,
          title: newTaskTitle.trim(),
          category: 'work',
          priority: 'medium',
          lane: 'todo',
          position: todoTasks.length,
        }])
        .select()
        .single();
      if (error) throw error;
      if (data) {
        await setTasksOptimistic([...tasks, data as TaskRow]);
        setNewTaskTitle('');
        toast({ title: 'Task added' });
      }
    } catch (err) {
      toast({
        title: 'Failed to add task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setAddingTask(false);
    }
  }

  async function handleSaveTask(id: string, updates: Partial<TaskRow>) {
    const wasCompleted = tasks.find((t) => t.id === id)?.completedAt;
    try {
      const { data, error } = await supabase.from('tasklog_tasks').update(updates).eq('id', id).select().single();
      if (error || !data) throw error ?? new Error('Task not found');
      const updated = data as TaskRow;
      await setTasksOptimistic(tasks.map((t) => (t.id === id ? updated : t)));
      if (!wasCompleted && updated.completedAt && profile) {
        await markTaskComplete(
          supabase,
          { id: updated.id, goalId: updated.goalId, title: updated.title, cost: updated.cost, costCategory: updated.costCategory, costLoggedAt: updated.costLoggedAt },
          toStreakProfile(profile.id, profile),
          true
        );
        await refreshCurrentProfile();
        toast({ title: 'Task completed', description: `"${updated.title}" marked as done.` });
      } else {
        toast({ title: 'Task updated' });
      }
    } catch (err) {
      toast({
        title: 'Failed to save task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteTask(id: string) {
    try {
      const { error } = await supabase.from('tasklog_tasks').delete().eq('id', id);
      if (error) throw error;
      await setTasksOptimistic(tasks.filter((t) => t.id !== id));
      toast({ title: 'Task deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await mutateTasks();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Board"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh board"
            onClick={handleManualRefresh}
            disabled={refreshing}
          >
            <RefreshCwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        }
      />
      <form onSubmit={handleAddTask} className="flex gap-2 px-4 py-3">
        <Label htmlFor="board-quick-add" className="sr-only">Quick add task</Label>
        <Input
          id="board-quick-add"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Quick add to To Do…"
          autoComplete="off"
          autoFocus
          disabled={addingTask}
        />
        <Button type="submit" size="icon" aria-label="Add task" disabled={addingTask || !newTaskTitle.trim()}>
          {addingTask ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
        </Button>
      </form>
      {isLoading ? (
        <div className="px-4"><Skeleton className="h-64 w-full" /></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {LANES.map((lane) => {
              const laneTasks = tasksInLane(lane.id);
              return (
                <SortableContext key={lane.id} items={laneTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <BoardColumn lane={lane}>
                    {laneTasks.map((task) => (
                      <TaskCard key={task.id} task={task} onClick={() => { setDetailTask(task); setDetailOpen(true); }} />
                    ))}
                  </BoardColumn>
                </SortableContext>
              );
            })}
          </div>
        </DndContext>
      )}
      <TaskDetailSheet
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />
    </div>
  );
}
