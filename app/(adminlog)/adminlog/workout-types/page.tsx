'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Trash2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface WorkoutType {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

async function fetchWorkoutTypes(): Promise<WorkoutType[]> {
  const res = await apiFetch('/api/adminlog/workout-types');
  if (!res.ok) throw new Error('Failed to load workout types');
  const data = await res.json();
  return data.workoutTypes ?? [];
}

export default function WorkoutTypesPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const { data: workoutTypes, isLoading, mutate } = useSWR(
    profile?.isAdmin ? 'adminlog-workout-types' : null,
    fetchWorkoutTypes
  );
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!label.trim()) return;
    setSaving(true);
    const nextSortOrder = (workoutTypes ?? []).length;
    const res = await apiFetch('/api/adminlog/workout-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, sortOrder: nextSortOrder }),
    });
    setSaving(false);
    if (res.ok) {
      setLabel('');
      mutate();
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await apiFetch(`/api/adminlog/workout-types/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    mutate();
  }

  async function remove(id: string) {
    await apiFetch(`/api/adminlog/workout-types/${id}`, { method: 'DELETE' });
    mutate();
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        These are the options BurnLog&apos;s AI onboarding shows for each day of the weekly workout plan.
        Deactivating a type hides it from new plans without touching profiles that already use it.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-2">
            <Label htmlFor="workout-type-label">New workout type</Label>
            <Input
              id="workout-type-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Mobility"
            />
          </div>
          <Button onClick={handleCreate} disabled={saving || !label.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add workout type'}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <div className="space-y-2">
          {(workoutTypes ?? []).map((wt) => (
            <Card key={wt.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{wt.label}</span>
                <Switch checked={wt.active} onCheckedChange={(checked) => toggleActive(wt.id, checked)} />
                <Button variant="ghost" size="icon" onClick={() => remove(wt.id)} aria-label={`Delete ${wt.label}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {(workoutTypes ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No workout types yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
