'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';
import { APPS, AppId, setEnabledApps } from '@/lib/appMode';
import { AppIcon } from '@/components/AppIcon';
import { useToast } from '@/components/ui/use-toast';
import { OnboardingProgressBar } from '@/components/onboarding/OnboardingProgressBar';
import { HorizontalStepper } from '@/components/ui/horizontal-stepper';
import { appSearchColor } from '@/lib/search/registry';

const SELECTABLE_APPS_BASE = Object.values(APPS).filter(
  (app) => app.id !== 'logbook' && app.id !== 'adminlog'
);

export default function OnboardingAppsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<AppId>>(new Set());
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('aiEnabled').eq('userId', user.id).single();
      setAiEnabled(!!data?.aiEnabled);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectableApps = SELECTABLE_APPS_BASE.filter((app) => app.id !== 'intellog' || aiEnabled);

  function toggle(id: AppId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    setSaving(true);
    const chosen = Array.from(selected);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ enabledApps: chosen })
      .eq('userId', user.id);
    if (error) {
      toast({ title: 'Could not save your app selection', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    setEnabledApps(chosen);
    router.push(`/onboarding/sequence?apps=${chosen.join(',')}&step=0`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <HorizontalStepper
          steps={[
            { label: 'Profile', state: 'completed' },
            { label: 'AI Insights', state: 'completed' },
            { label: 'Apps', state: 'active' },
          ]}
        />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">What do you want to track?</h1>
          <p className="text-sm text-muted-foreground">
            Pick the apps you want — Logbook ties them all together. You can always add more later.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {selectableApps.map((app) => {
            const isSelected = selected.has(app.id);
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => toggle(app.id)}
                className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                }`}
              >
                {isSelected && <Check className="absolute top-3 right-3 h-4 w-4 text-primary" />}
                <AppIcon id={app.id} size={32} />
                <span className="font-medium">{app.name}</span>
                <span className="text-xs text-muted-foreground">{app.tagline}</span>
              </button>
            );
          })}
        </div>
        <Button className="w-full" disabled={selected.size === 0 || saving} onClick={handleContinue}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
        </Button>
      </div>
      <OnboardingProgressBar current={3} total={3} color={appSearchColor('logbook')} />
    </div>
  );
}
