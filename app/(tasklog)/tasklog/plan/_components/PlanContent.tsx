'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { PlusIcon, Inbox, Lightbulb, RefreshCwIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { LANES, PRIORITIES, type IdeaRow, type TaskLane, type TaskRow } from '@/lib/tasklog/types';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { inboxTasksQuery, ideasQuery, ideaTaskCountsQuery } from '@/lib/tasklog/queries';
import { AddIdeaForm } from './AddIdeaForm';
import { IdeaCard } from './IdeaCard';
import { IdeaBreakdownReviewSheet, type BreakdownSuggestion } from './IdeaBreakdownReviewSheet';

export function PlanContent() {
  const supabase = createClient();
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [quickAddText, setQuickAddText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingIdeaId, setDeletingIdeaId] = useState<string | null>(null);

  const {
    data: inboxData,
    isLoading,
    mutate: mutateInbox,
  } = useSWR(
    profile ? inboxTasksQuery(profile.id).key : null,
    profile ? inboxTasksQuery(profile.id).fetcher : null
  );

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
      if (error) throw error;
      if (data) {
        await mutateInbox([data as TaskRow, ...inboxTasks], { revalidate: false });
        toast({ title: 'Task added to inbox' });
      }
    } catch (err) {
      toast({
        title: 'Failed to add task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  }

  async function handleTriage(taskId: string, lane: TaskLane) {
    const task = inboxTasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      const { data: laneTasks } = await supabase
        .from('tasklog_tasks')
        .select('id')
        .eq('profileId', task.profileId)
        .eq('lane', lane);
      const position = laneTasks?.length ?? 0;
      const { error } = await supabase.from('tasklog_tasks').update({ lane, position }).eq('id', taskId);
      if (error) throw error;
      await mutateInbox(inboxTasks.filter((t) => t.id !== taskId), { revalidate: false });
      const laneLabel = LANES.find((l) => l.id === lane)?.label ?? lane;
      toast({ title: `Moved to ${laneLabel}` });
    } catch (err) {
      toast({
        title: 'Failed to move task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleDelete(taskId: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingTaskId(taskId);
    try {
      const { error } = await supabase.from('tasklog_tasks').delete().eq('id', taskId);
      if (error) throw error;
      await mutateInbox(inboxTasks.filter((t) => t.id !== taskId), { revalidate: false });
      toast({ title: 'Task deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete task',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setDeletingTaskId(null);
    }
  }

  const {
    data: ideaData,
    isLoading: ideasLoading,
    mutate: mutateIdeas,
  } = useSWR(
    profile ? ideasQuery(profile.id).key : null,
    profile ? ideasQuery(profile.id).fetcher : null
  );

  const ideas = ideaData ?? [];

  const {
    data: ideaTaskData,
    mutate: mutateIdeaTaskCounts,
  } = useSWR(
    profile ? ideaTaskCountsQuery(profile.id).key : null,
    profile ? ideaTaskCountsQuery(profile.id).fetcher : null
  );

  const ideaTaskCounts = new Map<string, number>();
  for (const row of ideaTaskData ?? []) {
    ideaTaskCounts.set(row.ideaId, (ideaTaskCounts.get(row.ideaId) ?? 0) + 1);
  }

  async function handleIdeaAdded(idea: IdeaRow) {
    await mutateIdeas([idea, ...ideas], { revalidate: false });
  }

  async function handleDeleteIdea(ideaId: string) {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!window.confirm(`Delete "${idea?.title ?? 'this idea'}"? This cannot be undone.`)) return;
    setDeletingIdeaId(ideaId);
    try {
      const { error } = await supabase.from('tasklog_ideas').delete().eq('id', ideaId);
      if (error) throw error;
      await mutateIdeas(ideas.filter((i) => i.id !== ideaId), { revalidate: false });
      toast({ title: 'Idea deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete idea',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setDeletingIdeaId(null);
    }
  }

  const [breakdownIdea, setBreakdownIdea] = useState<IdeaRow | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  function handleGeneratePlan(idea: IdeaRow) {
    setBreakdownIdea(idea);
    setBreakdownOpen(true);
  }

  async function handleConfirmBreakdown(plan: string, selected: BreakdownSuggestion[]) {
    if (!breakdownIdea || !profile) return;
    try {
      const { data: updatedIdea, error: updateError } = await supabase
        .from('tasklog_ideas')
        .update({ plan })
        .eq('id', breakdownIdea.id)
        .select()
        .single();
      if (updateError) throw updateError;
      if (updatedIdea) {
        await mutateIdeas(ideas.map((i) => (i.id === breakdownIdea.id ? (updatedIdea as IdeaRow) : i)), { revalidate: false });
      }
      if (selected.length > 0) {
        const { error: insertError } = await supabase.from('tasklog_tasks').insert(
          selected.map((t) => ({
            profileId: profile.id,
            ideaId: breakdownIdea.id,
            title: t.title,
            notes: t.description || null,
            category: t.category,
            priority: t.priority,
            dueDate: t.suggestedDueDate || null,
            tags: [breakdownIdea.title],
          }))
        );
        if (insertError) throw insertError;
        await mutateInbox();
        await mutateIdeaTaskCounts();
      }
      setBreakdownOpen(false);
      toast({ title: 'Plan saved', description: `${selected.length} task${selected.length === 1 ? '' : 's'} added.` });
    } catch (err) {
      toast({
        title: 'Failed to save plan',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([mutateInbox(), mutateIdeas(), mutateIdeaTaskCounts()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Plan"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh plan"
            onClick={handleManualRefresh}
            disabled={refreshing}
          >
            <RefreshCwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        }
      />
      <Tabs defaultValue="tasks" className="px-4 pt-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="flex flex-col gap-3 pt-3">
          <form onSubmit={handleQuickAdd} className="flex gap-2">
            <Label htmlFor="plan-quick-add" className="sr-only">Dump a task</Label>
            <Input
              id="plan-quick-add"
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              placeholder='Dump a task… e.g. "call mom tomorrow high priority"'
              disabled={parsing}
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" size="icon" aria-label="Add to Plan" disabled={parsing || !quickAddText.trim()}>
              {parsing ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
            </Button>
          </form>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : inboxTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
              <Inbox className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-semibold">Your inbox is empty</p>
              <p className="text-xs text-muted-foreground">Dump a task above and triage it into a lane.</p>
            </div>
          ) : (
            inboxTasks.map((task) => {
              const priority = PRIORITIES.find((p) => p.id === task.priority);
              return (
                <Card key={task.id}>
                  <CardContent className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priority?.color }} aria-hidden="true" />
                      <p className="text-sm font-medium">{task.title}</p>
                    </div>
                    {task.dueDate && <p className="text-xs text-muted-foreground">Due {task.dueDate}</p>}
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`lane-select-${task.id}`} className="sr-only">Move &quot;{task.title}&quot; to lane</Label>
                      <Select onValueChange={(lane) => handleTriage(task.id, lane as TaskLane)}>
                        <SelectTrigger id={`lane-select-${task.id}`} className="h-8 w-40 text-xs"><SelectValue placeholder="Move to lane…" /></SelectTrigger>
                        <SelectContent>
                          {LANES.map((lane) => (
                            <SelectItem key={lane.id} value={lane.id}>{lane.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete task "${task.title}"`}
                        onClick={() => handleDelete(task.id, task.title)}
                        disabled={deletingTaskId === task.id}
                      >
                        {deletingTaskId === task.id ? 'Deleting…' : 'Delete'}
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
            <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
              <Lightbulb className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-semibold">No ideas yet</p>
              <p className="text-xs text-muted-foreground">Capture an idea above and turn it into a plan.</p>
            </div>
          ) : (
            ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                taskCount={ideaTaskCounts.get(idea.id) ?? 0}
                onGeneratePlan={handleGeneratePlan}
                onDelete={handleDeleteIdea}
                deleting={deletingIdeaId === idea.id}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
      <IdeaBreakdownReviewSheet
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        idea={breakdownIdea}
        onConfirm={handleConfirmBreakdown}
      />
    </div>
  );
}
