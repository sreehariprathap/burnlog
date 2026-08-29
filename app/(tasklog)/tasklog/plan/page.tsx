// app/(tasklog)/tasklog/plan/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlusIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LANES, PRIORITIES, type IdeaRow, type TaskLane, type TaskRow } from '@/lib/tasklog/types';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { AddIdeaForm } from './_components/AddIdeaForm';
import { IdeaCard } from './_components/IdeaCard';
import { IdeaBreakdownReviewSheet, type BreakdownSuggestion } from './_components/IdeaBreakdownReviewSheet';

export default function PlanPage() {
  const supabase = createClientComponentClient();
  const { profile } = useCurrentProfile();
  const [quickAddText, setQuickAddText] = useState('');
  const [parsing, setParsing] = useState(false);

  const {
    data: inboxData,
    isLoading,
    mutate: mutateInbox,
  } = useSWR(profile ? ['tasklog-inbox', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profile!.id)
      .is('lane', null)
      .order('createdAt', { ascending: false });
    return (data as TaskRow[]) || [];
  });

  const inboxTasks = inboxData ?? [];

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const text = quickAddText.trim();
    if (!text || !profile) return;
    setParsing(true);
    setQuickAddText('');
    try {
      let title = text;
      let dueDate: string | null = null;
      let priority: 'low' | 'medium' | 'high' = 'medium';
      try {
        const res = await fetch('/api/ai/tasklog/parse-quick-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const parsed = await res.json();
          if (parsed.title) title = parsed.title;
          if (parsed.dueDate) dueDate = parsed.dueDate;
          if (parsed.priority) priority = parsed.priority;
        }
      } catch {
        // AI parsing failed — fall back to the plain title captured above.
      }

      const { data, error } = await supabase
        .from('tasklog_tasks')
        .insert([{ profileId: profile.id, title, dueDate, priority, category: 'work' }])
        .select()
        .single();
      if (!error && data) {
        await mutateInbox([data as TaskRow, ...inboxTasks], { revalidate: false });
      }
    } finally {
      setParsing(false);
    }
  }

  async function handleTriage(taskId: string, lane: TaskLane) {
    const task = inboxTasks.find((t) => t.id === taskId);
    if (!task) return;
    const { data: laneTasks } = await supabase
      .from('tasklog_tasks')
      .select('id')
      .eq('profileId', task.profileId)
      .eq('lane', lane);
    const position = laneTasks?.length ?? 0;
    const { error } = await supabase.from('tasklog_tasks').update({ lane, position }).eq('id', taskId);
    if (!error) {
      await mutateInbox(inboxTasks.filter((t) => t.id !== taskId), { revalidate: false });
    }
  }

  async function handleDelete(taskId: string) {
    await supabase.from('tasklog_tasks').delete().eq('id', taskId);
    await mutateInbox(inboxTasks.filter((t) => t.id !== taskId), { revalidate: false });
  }

  const {
    data: ideaData,
    isLoading: ideasLoading,
    mutate: mutateIdeas,
  } = useSWR(profile ? ['tasklog-ideas', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_ideas')
      .select('*')
      .eq('profileId', profile!.id)
      .order('createdAt', { ascending: false });
    return (data as IdeaRow[]) || [];
  });

  const ideas = ideaData ?? [];

  const {
    data: ideaTaskData,
  } = useSWR(profile ? ['tasklog-idea-task-counts', profile.id] : null, async () => {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('ideaId')
      .eq('profileId', profile!.id)
      .not('ideaId', 'is', null);
    return (data as { ideaId: string }[]) || [];
  });

  const ideaTaskCounts = new Map<string, number>();
  for (const row of ideaTaskData ?? []) {
    ideaTaskCounts.set(row.ideaId, (ideaTaskCounts.get(row.ideaId) ?? 0) + 1);
  }

  async function handleIdeaAdded(idea: IdeaRow) {
    await mutateIdeas([idea, ...ideas], { revalidate: false });
  }

  async function handleDeleteIdea(ideaId: string) {
    await supabase.from('tasklog_ideas').delete().eq('id', ideaId);
    await mutateIdeas(ideas.filter((i) => i.id !== ideaId), { revalidate: false });
  }

  const [breakdownIdea, setBreakdownIdea] = useState<IdeaRow | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  function handleGeneratePlan(idea: IdeaRow) {
    setBreakdownIdea(idea);
    setBreakdownOpen(true);
  }

  async function handleConfirmBreakdown(plan: string, selected: BreakdownSuggestion[]) {
    if (!breakdownIdea || !profile) return;
    const { data: updatedIdea, error: updateError } = await supabase
      .from('tasklog_ideas')
      .update({ plan })
      .eq('id', breakdownIdea.id)
      .select()
      .single();
    if (!updateError && updatedIdea) {
      await mutateIdeas(ideas.map((i) => (i.id === breakdownIdea.id ? (updatedIdea as IdeaRow) : i)), { revalidate: false });
    }
    if (selected.length > 0) {
      await supabase.from('tasklog_tasks').insert(
        selected.map((t) => ({
          profileId: profile.id,
          ideaId: breakdownIdea.id,
          title: t.title,
          category: t.category,
          priority: t.priority,
          dueDate: t.suggestedDueDate || null,
        }))
      );
      await mutateInbox();
    }
    setBreakdownOpen(false);
  }

  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <Tabs defaultValue="tasks" className="px-4 pt-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="flex flex-col gap-3 pt-3">
          <form onSubmit={handleQuickAdd} className="flex gap-2">
            <Input
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              placeholder='Dump a task… e.g. "call mom tomorrow high priority"'
              disabled={parsing}
            />
            <Button type="submit" size="icon" aria-label="Add to Plan" disabled={parsing}>
              <PlusIcon className="h-4 w-4" />
            </Button>
          </form>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : inboxTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in your inbox. Dump a task above.</p>
          ) : (
            inboxTasks.map((task) => {
              const priority = PRIORITIES.find((p) => p.id === task.priority);
              return (
                <Card key={task.id}>
                  <CardContent className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priority?.color }} />
                      <p className="text-sm font-medium">{task.title}</p>
                    </div>
                    {task.dueDate && <p className="text-xs text-muted-foreground">Due {task.dueDate}</p>}
                    <div className="flex items-center gap-2">
                      <Select onValueChange={(lane) => handleTriage(task.id, lane as TaskLane)}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Move to lane…" /></SelectTrigger>
                        <SelectContent>
                          {LANES.map((lane) => (
                            <SelectItem key={lane.id} value={lane.id}>{lane.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(task.id)}>
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="ideas" className="flex flex-col gap-3 pt-3 pb-4">
          {profile && <AddIdeaForm profileId={profile.id} onIdeaAdded={handleIdeaAdded} />}
          {ideasLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ideas yet. Capture one above.</p>
          ) : (
            ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                taskCount={ideaTaskCounts.get(idea.id) ?? 0}
                onGeneratePlan={handleGeneratePlan}
                onDelete={handleDeleteIdea}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
      <TaskLogBottomNav />
      <IdeaBreakdownReviewSheet
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        idea={breakdownIdea}
        onConfirm={handleConfirmBreakdown}
      />
    </div>
  );
}
