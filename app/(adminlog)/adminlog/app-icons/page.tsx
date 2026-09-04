'use client';

import { useEffect, useState } from 'react';
import { mutate as mutateGlobal } from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppIcon } from '@/components/AppIcon';
import { APPS, type AppId } from '@/lib/appMode';
import { ANIMATED_APP_ICONS_TOGGLE_KEY } from '@/lib/animatedAppIcons';
import { TOGGLES_KEY } from '@/lib/useFeatureToggle';

const PREVIEW_APPS: AppId[] = Object.keys(APPS) as AppId[];

export default function AppIconsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const supabase = createClient();

  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('adminlog_toggles')
        .select('globallyEnabled')
        .eq('key', ANIMATED_APP_ICONS_TOGGLE_KEY)
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
          { key: ANIMATED_APP_ICONS_TOGGLE_KEY, type: 'feature', label: 'Animated App Icons', globallyEnabled: next },
          { onConflict: 'key' }
        );
      if (error) throw error;
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
        Switches every app&rsquo;s icon (AppSwitcher, TopBar, onboarding app picker) between
        app-colored, hover-animated Lucide icons and plain letter badges. Off by default; Logbook
        keeps its own brand mark when off, and gets an animated book icon when on. Every icon
        renders in its own app&rsquo;s color, regardless of which app&rsquo;s theme is currently active.
      </p>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <Label htmlFor="app-icons-switch" className="text-base">Animated App Icons</Label>
            <p className="text-sm text-muted-foreground">Applies globally, for every user.</p>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Switch
              id="app-icons-switch"
              checked={enabled}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Live preview</p>
          <p className="text-xs text-muted-foreground">
            Reflects the switch above in real time — hover an icon to see its animation.
          </p>
          <div className="grid grid-cols-5 gap-4">
            {PREVIEW_APPS.map((id) => (
              <div key={id} className="flex flex-col items-center gap-1.5">
                <AppIcon id={id} size={32} />
                <span className="text-[11px] text-muted-foreground">{APPS[id].name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
