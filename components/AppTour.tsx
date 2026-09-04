'use client';

import { useEffect, useState } from 'react';
import { Joyride, STATUS, type EventData, type Step } from 'react-joyride';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';

const steps: Step[] = [
  {
    target: 'body',
    placement: 'center',
    title: 'Welcome to LogBook',
    content: "Let's take a quick look around — this'll only take a few seconds.",
  },
  {
    target: '[data-tour="app-switcher"]',
    title: 'Switch apps',
    content: 'Tap your app icon here any time to jump between BurnLog, MoneyLog, TaskLog, and everything else you track.',
  },
  {
    target: '[data-tour="global-search"]',
    title: 'Search everything',
    content: 'Search across every app from one place — start typing to jump straight to a page or feature.',
  },
  {
    target: '[data-tour="bottom-nav"]',
    title: 'Get around',
    content: "Logbook is your home base, MyDay gives you a day-by-day view, and your profile's in the corner.",
  },
  {
    target: '[data-tour="quick-add"]',
    title: 'Quick add',
    content: 'Use this button to log something in seconds — a meal, a workout, an expense — without leaving this screen.',
  },
  {
    target: 'body',
    placement: 'center',
    title: 'Look for the ✨ Ask AI button',
    content: "Inside BurnLog, TaskLog, and other apps you'll find an Ask AI button — use it any time you want help or a personalized suggestion.",
  },
];

/** Mounted on the Logbook home page; runs the one-time onboarding tour for
 * users who haven't seen it, then persists the flag on their profile so it
 * never runs again (see `hasSeenAppTour` on `profiles`). */
export function AppTour() {
  const { profile, loading } = useCurrentProfile();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!loading && profile && !profile.hasSeenAppTour) {
      setRun(true);
    }
  }, [loading, profile]);

  async function markSeen() {
    if (!profile) return;
    const supabase = createClient();
    await supabase.from('profiles').update({ hasSeenAppTour: true }).eq('id', profile.id);
    refreshCurrentProfile();
  }

  function handleEvent(data: EventData) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
      markSeen();
    }
  }

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      options={{
        arrowColor: 'var(--card)',
        backgroundColor: 'var(--card)',
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        primaryColor: 'var(--primary)',
        textColor: 'var(--card-foreground)',
        zIndex: 10000,
        showProgress: true,
        skipScroll: true,
        buttons: ['back', 'close', 'primary', 'skip'],
      }}
      styles={{
        tooltipTitle: {
          fontWeight: 600,
        },
      }}
    />
  );
}
