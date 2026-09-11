'use client';

import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UI_VERSION_KEY } from '@/lib/theme/uiVersion';

export default function UiVersionPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/ui-version');
      if (res.ok) {
        const data = await res.json();
        setEnabled(Boolean(data.enabled));
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  async function toggle(next: boolean) {
    setEnabled(next);
    setSaving(true);
    await apiFetch('/api/adminlog/ui-version', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    setSaving(false);
    // Every consumer (UiVersionSettingsEffect, this page) shares this SWR
    // key — revalidate so the change is visible immediately instead of
    // waiting out the 60s dedupingInterval.
    mutate(UI_VERSION_KEY);
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Switches Button, Card, Input, and the bottom nav between today&apos;s flat look and a glass look
        (translucent, blurred surfaces) app-wide. Global only — no per-app override. Per-app accent colors are
        unaffected either way.
      </p>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-0.5">
            <Label htmlFor="ui-v2">UI v2 (Beta)</Label>
            <p className="text-sm text-muted-foreground">
              {enabled ? 'Glass surfaces are live app-wide.' : "Off — today's flat look."}
            </p>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Switch id="ui-v2" checked={enabled} disabled={saving} onCheckedChange={toggle} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
