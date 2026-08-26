// app/(homelog)/homelog/chores/page.tsx
'use client';

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
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface ChoreInstanceInfo {
  id: string;
  dueDate: string;
  assignedProfileId: string | null;
  assignedName: string | null;
}

interface ChoreInfo {
  id: string;
  title: string;
  category: string;
  frequency: string;
  instance: ChoreInstanceInfo | null;
}

async function fetchChores(): Promise<ChoreInfo[]> {
  const res = await fetch('/api/homelog/chores');
  const body = await res.json();
  return body.chores ?? [];
}

export default function ChoresPage() {
  const { household, isLoading: householdLoading } = useHouseholdMe();
  const {
    data: chores,
    isLoading: choresLoading,
    mutate: refresh,
  } = useSWR(!householdLoading && household ? 'homelog-chores' : null, fetchChores);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('cleaning');
  const [frequency, setFrequency] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [monthOfYear, setMonthOfYear] = useState('1');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chore');
    } finally {
      setCreating(false);
    }
  }

  async function handleComplete(instanceId: string) {
    await fetch(`/api/homelog/chores/instances/${instanceId}/complete`, { method: 'POST' });
    await refresh();
  }

  async function handleDelete(choreId: string) {
    await fetch(`/api/homelog/chores/${choreId}`, { method: 'DELETE' });
    await refresh();
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
      <TopBar title="Chores" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Card>
          <CardHeader>
            <CardTitle>Add a chore</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Take out trash" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">Cleaning</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Label>Day of week</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <Label>Day of month</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(e.target.value)}
                    />
                  </div>
                  {frequency === 'yearly' && (
                    <div className="space-y-1.5">
                      <Label>Month</Label>
                      <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>First due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add chore'}</Button>
            </form>
          </CardContent>
        </Card>

        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !chores || chores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chores yet. Add one above.</p>
        ) : (
          chores.map((chore) => (
            <Card key={chore.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{chore.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {chore.category} · {chore.frequency}
                    {chore.instance && ` · due ${chore.instance.dueDate}`}
                    {chore.instance?.assignedName && ` · ${chore.instance.assignedName}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {chore.instance && (
                    <Button type="button" size="sm" onClick={() => handleComplete(chore.instance!.id)}>
                      Done
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleDelete(chore.id)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <HomeLogBottomNav />
    </div>
  );
}
