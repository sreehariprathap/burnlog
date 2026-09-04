'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import SiriOrb from '@/components/smoothui/siri-orb';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { OnboardingProgressBar } from '@/components/onboarding/OnboardingProgressBar';
import { HorizontalStepper } from '@/components/ui/horizontal-stepper';
import { appSearchColor } from '@/lib/search/registry';

const BENEFITS = [
  'Your fitness coach adjusts your plan as your workouts and meals change.',
  'Your financial coach spots spending patterns and flags what to fix.',
  'Your task coach breaks a big goal into a concrete first week.',
];

export default function AiInsightsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  async function choose(aiEnabled: boolean) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    const update: Record<string, boolean> = { aiEnabled };
    if (!aiEnabled) {
      update.learnLogAiEnabled = false;
      update.weeklyTripSuggestionsEnabled = false;
    }
    const { error } = await supabase.from('profiles').update(update).eq('userId', user.id);
    if (error) {
      toast({ title: 'Could not save your choice', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    router.push('/onboarding/apps');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 text-center">
      <HorizontalStepper
        steps={[
          { label: 'Profile', state: 'completed' },
          { label: 'AI Insights', state: 'active' },
          { label: 'Apps', state: 'default' },
        ]}
      />
      <SiriOrb size="140px" state={saving ? 'thinking' : 'idle'} />
      <div className="max-w-sm space-y-4">
        <h1 className="text-3xl font-bold">Let AI help set things up</h1>
        <ul className="space-y-2 text-left text-sm text-muted-foreground">
          {BENEFITS.map((b) => (
            <li key={b} className="flex gap-2">
              <span aria-hidden>✨</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" disabled={saving} onClick={() => choose(true)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, turn on AI'}
        </Button>
        <Button size="lg" variant="outline" disabled={saving} onClick={() => choose(false)}>
          Not right now
        </Button>
      </div>
      <p className="max-w-sm text-xs text-muted-foreground">
        If you turn this on, your activity across the apps you use may be used to power AI features and improve how they work. See our{' '}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
      <OnboardingProgressBar current={2} total={3} color={appSearchColor('logbook')} />
    </div>
  );
}
