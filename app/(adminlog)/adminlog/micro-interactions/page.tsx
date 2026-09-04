'use client';

import { useEffect, useState } from 'react';
import { mutate as mutateGlobal } from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tappable } from '@/components/ui/tappable';
import { StaggerGrid, StaggerItem } from '@/components/ui/stagger-grid';
import { MICRO_INTERACTIONS_TOGGLE_KEY } from '@/lib/microInteractions';
import { TOGGLES_KEY } from '@/lib/useFeatureToggle';

const PREVIEW_ITEMS = ['Tap me', 'And me', 'Me too'];

export default function MicroInteractionsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const supabase = createClient();

  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('adminlog_toggles')
        .select('globallyEnabled')
        .eq('key', MICRO_INTERACTIONS_TOGGLE_KEY)
        .maybeSingle();
      setEnabled(data?.globallyEnabled ?? false);
      setLoading(false);
    })();
  }, [profile?.isAdmin, supabase]);

  async function handleToggle(next: boolean) {
    const rollback = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('adminlog_toggles')
        .upsert(
          { key: MICRO_INTERACTIONS_TOGGLE_KEY, type: 'feature', label: 'Micro Interactions', globallyEnabled: next },
          { onConflict: 'key' }
        );
      if (error) throw error;
      // useFeatureToggle (Tappable/StaggerGrid in the preview below, and
      // everywhere else) is SWR-cached for a minute — force it to refetch
      // now so the preview and every other consumer reflect this
      // immediately instead of the stale cached value.
      if (profile) await mutateGlobal([TOGGLES_KEY, profile.id]);
    } catch {
      setEnabled(rollback);
    } finally {
      setSaving(false);
    }
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Turns on the app&rsquo;s opt-in press/hover/stagger animations (built with{' '}
        <code className="rounded bg-muted px-1 py-0.5">motion</code>) — bottom-nav taps and a few
        list/grid entrances so far. Off by default; components fall back to plain, unanimated
        markup until this is on.
      </p>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <Label htmlFor="micro-interactions-switch" className="text-base">Micro Interactions</Label>
            <p className="text-sm text-muted-foreground">Applies globally, for every user.</p>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Switch
              id="micro-interactions-switch"
              checked={enabled}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Live preview</p>
            <button
              type="button"
              onClick={() => setPreviewKey((k) => k + 1)}
              className="text-xs text-primary hover:underline"
            >
              Replay entrance
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Reflects the switch above in real time — tap a row, or hit &ldquo;Replay entrance&rdquo;
            to see the stagger-in again.
          </p>
          <StaggerGrid key={previewKey} className="space-y-2">
            {PREVIEW_ITEMS.map((label) => (
              <StaggerItem key={label}>
                <Tappable className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  {label}
                </Tappable>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </CardContent>
      </Card>
    </div>
  );
}
