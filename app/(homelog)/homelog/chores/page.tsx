// app/(homelog)/homelog/chores/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ListTodo, RefreshCw } from 'lucide-react';
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';
import { useToast } from '@/components/ui/use-toast';
import { choresQuery } from '@/lib/homelog/queries';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function ChoresPage() {
  const { toast } = useToast();
  const { household, members, isLoading: householdLoading } = useHouseholdMe();
  const {
    data: chores,
    isLoading: choresLoading,
    mutate: refresh,
  } = useSWR(
    !householdLoading && household ? choresQuery().key : null,
    !householdLoading && household ? choresQuery().fetcher : null
  );

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('cleaning');
  const [frequency, setFrequency] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [monthOfYear, setMonthOfYear] = useState('1');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [togglingRotateId, setTogglingRotateId] = useState<string | null>(null);

  const loading = householdLoading || choresLoading;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a chore title');
      return;
    }
    setError('');
    setCreating(true);
    try {
      const res = await fetch('/api/homelog/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          frequency,
          dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : null,
          dayOfMonth: frequency === 'monthly' || frequency === 'yearly' ? Number(dayOfMonth) : null,
          monthOfYear: frequency === 'yearly' ? Number(monthOfYear) : null,
          dueDate,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create chore');
      setTitle('');
      await refresh();
      toast({ title: 'Chore added' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create chore';
      setError(message);
      toast({ title: 'Failed to add chore', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleComplete(instanceId: string) {
    setCompletingId(instanceId);
    try {
      const res = await fetch(`/api/homelog/chores/instances/${instanceId}/complete`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to mark chore as done');
      await refresh();
      toast({ title: 'Chore marked as done' });
    } catch (err) {
      toast({
        title: 'Failed to update chore',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setCompletingId(null);
    }
  }

  async function handleReassign(instanceId: string, assignedProfileId: string | null) {
    setReassigningId(instanceId);
    try {
      const res = await fetch(`/api/homelog/chores/instances/${instanceId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedProfileId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to reassign chore');
      await refresh();
      toast({ title: 'Chore reassigned' });
    } catch (err) {
      toast({
        title: 'Failed to reassign chore',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setReassigningId(null);
    }
  }

  async function handleToggleAutoRotate(choreId: string, autoRotate: boolean) {
    setTogglingRotateId(choreId);
    try {
      const res = await fetch(`/api/homelog/chores/${choreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRotate }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update chore');
      await refresh();
    } catch (err) {
      toast({
        title: 'Failed to update chore',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setTogglingRotateId(null);
    }
  }

  async function handleDelete(choreId: string) {
    if (!window.confirm('Delete this chore? This cannot be undone.')) return;
    setDeletingId(choreId);
    try {
      const res = await fetch(`/api/homelog/chores/${choreId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete chore');
      await refresh();
      toast({ title: 'Chore deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete chore',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (!householdLoading && !household) {
    return (
      <div className="pb-24">
        <TopBar title="Chores" />
        <div className="px-4 py-8 text-center text-muted-foreground">
          <p>You need a household first.</p>
          <Link href="/homelog" className="text-primary underline">
            Go to HomeLog home
          </Link>
        </div>
        <HomeLogBottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Chores"
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => refresh()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Card>
          <CardHeader>
            <CardTitle>Add a chore</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="chore-title">Title</Label>
                <Input
                  id="chore-title"
                  autoFocus
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Take out trash"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="chore-category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="chore-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">Cleaning</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="chore-frequency">Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger id="chore-frequency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {frequency === 'weekly' && (
                <div className="space-y-1.5">
                  <Label htmlFor="chore-day-of-week">Day of week</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger id="chore-day-of-week"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(frequency === 'monthly' || frequency === 'yearly') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="chore-day-of-month">Day of month</Label>
                    <Input
                      id="chore-day-of-month"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="31"
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(e.target.value)}
                    />
                  </div>
                  {frequency === 'yearly' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="chore-month">Month</Label>
                      <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                        <SelectTrigger id="chore-month"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((month, index) => (
                            <SelectItem key={month} value={String(index + 1)}>{month}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="chore-due-date">First due date</Label>
                <Input id="chore-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add chore'}</Button>
            </form>
          </CardContent>
        </Card>

        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !chores || chores.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">No chores yet</p>
            <p className="text-xs text-muted-foreground">Add a chore above to start sharing the load.</p>
          </div>
        ) : (
          chores.map((chore) => (
            <Card key={chore.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{chore.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {chore.category} · {chore.frequency}
                      {chore.instance && ` · due ${chore.instance.dueDate}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {chore.instance && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleComplete(chore.instance!.id)}
                        disabled={completingId === chore.instance.id}
                      >
                        {completingId === chore.instance.id ? 'Saving…' : 'Done'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(chore.id)}
                      disabled={deletingId === chore.id}
                    >
                      {deletingId === chore.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                </div>

                {chore.instance && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`assignee-${chore.id}`} className="text-xs text-muted-foreground">
                        Assigned to
                      </Label>
                      <Select
                        value={chore.instance.assignedProfileId ?? 'unassigned'}
                        onValueChange={(value) =>
                          handleReassign(chore.instance!.id, value === 'unassigned' ? null : value)
                        }
                        disabled={reassigningId === chore.instance.id}
                      >
                        <SelectTrigger id={`assignee-${chore.id}`} className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.profileId} value={member.profileId}>
                              {member.firstName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {chore.frequency !== 'once' && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`auto-rotate-${chore.id}`} className="text-xs text-muted-foreground">
                          Auto-rotate
                        </Label>
                        <Switch
                          id={`auto-rotate-${chore.id}`}
                          checked={chore.autoRotate}
                          onCheckedChange={(checked) => handleToggleAutoRotate(chore.id, checked)}
                          disabled={togglingRotateId === chore.id}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <HomeLogBottomNav />
    </div>
  );
}
