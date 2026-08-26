// app/(tasklog)/tasklog/board/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlusIcon } from 'lucide-react';
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
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LANES, type TaskLane, type TaskRow } from '@/lib/tasklog/types';
import { markTaskComplete } from '@/lib/tasklog/completeTask';
import { TaskCard } from './_components/TaskCard';
import { TaskDetailSheet } from './_components/TaskDetailSheet';
import { BoardColumn } from './_components/BoardColumn';

type ProfileRow = {
  id: string;
  taskLogCurrentStreak: number;
  taskLogLongestStreak: number;
  lastTaskLogStreakDate: string | null;
};

export default function BoardPage() {
  const supabase = createClientComponentClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTask, setDetailTask] = useState<TaskRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, taskLogCurrentStreak, taskLogLongestStreak, lastTaskLogStreakDate')
      .eq('userId', user.id)
      .single();
    if (!profileRow) { setLoading(false); return; }
    setProfile(profileRow as ProfileRow);

    const { data: taskRows } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profileRow.id)
      .not('lane', 'is', null)
      .order('position', { ascending: true });
    setTasks((taskRows as TaskRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function tasksInLane(lane: TaskLane): TaskRow[] {
    return tasks.filter((t) => t.lane === lane);
  }

  function findLaneOfTask(id: string): TaskLane | null {
    return (tasks.find((t) => t.id === id)?.lane as TaskLane | undefined) ?? null;
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
      setTasks((prev) => [...prev.filter((t) => t.lane !== sourceLane), ...reordered]);
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

    setTasks((prev) => [
      ...prev.filter((t) => t.lane !== sourceLane && t.lane !== destLane),
      ...sourceTasks,
      ...newDestTasks,
    ]);

    await persistLanePositions(sourceLane, sourceTasks);
    await persistLanePositions(destLane, newDestTasks);

    if (destLane === 'done' && profile) {
      await markTaskComplete(supabase, { id: movedTask.id, goalId: movedTask.goalId }, profile, true);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !profile) return;
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
    if (!error && data) {
      setTasks((prev) => [...prev, data as TaskRow]);
      setNewTaskTitle('');
    }
  }

  async function handleSaveTask(id: string, updates: Partial<TaskRow>) {
    const wasCompleted = tasks.find((t) => t.id === id)?.completedAt;
    const { data, error } = await supabase.from('tasklog_tasks').update(updates).eq('id', id).select().single();
    if (error || !data) return;
    const updated = data as TaskRow;
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    if (!wasCompleted && updated.completedAt && profile) {
      await markTaskComplete(supabase, { id: updated.id, goalId: updated.goalId }, profile, true);
    }
  }

  async function handleDeleteTask(id: string) {
    await supabase.from('tasklog_tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="pb-24">
      <TopBar title="Board" />
      <form onSubmit={handleAddTask} className="flex gap-2 px-4 py-3">
        <Input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Quick add to To Do…" />
        <Button type="submit" size="icon" aria-label="Add task">
          <PlusIcon className="h-4 w-4" />
        </Button>
      </form>
      {loading ? (
        <div className="px-4"><Skeleton className="h-64 w-full" /></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto px-4 pb-4">
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
      <TaskLogBottomNav />
    </div>
  );
}
