'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Trash2, Lock, Upload } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { APPS, type AppId } from '@/lib/appMode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AppSwitchLottie } from '@/components/AppSwitchLottie';

interface AnimationSummary {
  id: string;
  name: string;
  kind: 'lottie' | 'siri_orb';
  isReadOnly: boolean;
  filePath: string | null;
  hasData: boolean;
}

// Resolves the fetch target for an animation's preview: its static file for
// built-ins, or the by-id DB route for custom ones — same rule the public
// /api/loading-animations route applies when resolving an app's assignment.
function srcFor(a: AnimationSummary): string {
  return a.filePath ?? `/api/loading-animations/${a.id}`;
}

interface LibraryResponse {
  animations: AnimationSummary[];
  assignments: Record<string, string | null>;
}

// The unassigned-app sentinel for the assignment <Select> — Radix Select
// item values can't be an empty string, and "None" maps to a null
// animationId in the PUT body.
const NONE_VALUE = '__none__';

async function fetchLibrary(): Promise<LibraryResponse> {
  const res = await apiFetch('/api/adminlog/loading-animations');
  if (!res.ok) throw new Error('Failed to load animations');
  return res.json();
}

const ALL_APP_IDS = Object.keys(APPS) as AppId[];

export default function LoadingAnimationsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const { data, isLoading, mutate } = useSWR(profile?.isAdmin ? 'adminlog-loading-animations' : null, fetchLibrary);

  const [name, setName] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonText(await file.text());
    if (!name.trim()) setName(file.name.replace(/\.json$/i, ''));
  }

  async function handleCreate() {
    setFormError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setFormError('That is not valid JSON.');
      return;
    }
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }

    setSaving(true);
    const res = await apiFetch('/api/adminlog/loading-animations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), data: parsed }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Failed to save animation.');
      return;
    }
    setName('');
    setJsonText('');
    mutate();
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/adminlog/loading-animations/${id}`, { method: 'DELETE' });
    mutate();
  }

  async function handleAssign(appId: AppId, animationId: string) {
    const nextId = animationId === NONE_VALUE ? null : animationId;
    // Optimistic update so the <Select> doesn't visually snap back while
    // the request is in flight.
    mutate((current) => current && { ...current, assignments: { ...current.assignments, [appId]: nextId } }, false);
    await apiFetch('/api/adminlog/loading-animations/assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, animationId: nextId }),
    });
    mutate();
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  const animations = data?.animations ?? [];
  const assignments = data?.assignments ?? {};
  const animationsById = new Map(animations.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Manage the animation shown above the checklist while switching apps. Built-in animations are
        read-only; upload or paste your own and assign it to any app, including IntelLog.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Add animation</p>
          <div className="space-y-2">
            <Label htmlFor="anim-name">Name</Label>
            <Input id="anim-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Confetti burst" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anim-file">Upload a .json file</Label>
            <Input id="anim-file" type="file" accept=".json,application/json" onChange={handleFileChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anim-json">…or paste Lottie JSON</Label>
            <Textarea
              id="anim-json"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{"v": "5.9.6", "layers": [...]}'
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          {jsonText.trim() && !formError && (
            <div className="flex justify-center py-2">
              <PreviewFromText jsonText={jsonText} />
            </div>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button onClick={handleCreate} disabled={saving || !jsonText.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                <Upload className="h-4 w-4" /> Save animation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Library</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {animations.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex flex-col items-center gap-2 p-3">
                    <AppSwitchLottie src={srcFor(a)} kind={a.kind} />
                    <p className="text-xs font-medium text-center truncate w-full">{a.name}</p>
                    {a.isReadOnly ? (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> Built-in
                      </Badge>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} aria-label={`Delete ${a.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">App assignments</p>
            <div className="space-y-2">
              {ALL_APP_IDS.map((appId) => {
                const currentId = assignments[appId] ?? null;
                const current = currentId ? animationsById.get(currentId) : undefined;
                return (
                  <Card key={appId}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="w-24 shrink-0 text-sm font-medium">{APPS[appId].name}</div>
                      <Select value={currentId ?? NONE_VALUE} onValueChange={(v) => handleAssign(appId, v)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>None (text only)</SelectItem>
                          <SelectGroup>
                            <SelectLabel>Built-in</SelectLabel>
                            {animations.filter((a) => a.isReadOnly).map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Custom</SelectLabel>
                            {animations.filter((a) => !a.isReadOnly).map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <div className="shrink-0">
                        {current ? (
                          <AppSwitchLottie src={srcFor(current)} kind={current.kind} />
                        ) : (
                          <div className="w-[140px] h-[140px]" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewFromText({ jsonText }: { jsonText: string }) {
  let parsed: object | null = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray((parsed as Record<string, unknown>).layers)) return null;
  return <AppSwitchLottie src={parsed} kind="lottie" />;
}
