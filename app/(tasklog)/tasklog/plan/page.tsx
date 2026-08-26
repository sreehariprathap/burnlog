// app/(tasklog)/tasklog/plan/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlusIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANES, PRIORITIES, type TaskLane, type TaskRow } from '@/lib/tasklog/types';

type ProfileRow = { id: string };

export default function PlanPage() {
  const supabase = createClientComponentClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [inboxTasks, setInboxTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAddText, setQuickAddText] = useState('');
  const [parsing, setParsing] = useState(false);

  const fetchInbox = useCallback(async (profileId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('*')
      .eq('profileId', profileId)
      .is('lane', null)
      .order('createdAt', { ascending: false });
    setInboxTasks((data as TaskRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profileRow) return;
      setProfile(profileRow as ProfileRow);
      await fetchInbox(profileRow.id);
    })();
  }, [supabase, fetchInbox]);

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
        setInboxTasks((prev) => [data as TaskRow, ...prev]);
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
      setInboxTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  }

  async function handleDelete(taskId: string) {
    await supabase.from('tasklog_tasks').delete().eq('id', taskId);
    setInboxTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <form onSubmit={handleQuickAdd} className="flex gap-2 px-4 py-3">
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
      <div className="flex flex-col gap-3 px-4 pb-4">
        {loading ? (
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
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
