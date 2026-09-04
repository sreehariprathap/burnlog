'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { setAppTheme, type AppId } from '@/lib/appMode';
import { appSearchColor } from '@/lib/search/registry';
import { OnboardingProgressBar } from './OnboardingProgressBar';

interface OnboardingStepShellProps {
  app: AppId;
  children: ReactNode;
}

// Reads step/total off the URL (set by the sequence orchestrator — see
// app/onboarding/sequence/page.tsx) in its own Suspense boundary, since
// useSearchParams requires one around whichever component calls it.
function ProgressFromParams({ app }: { app: AppId }) {
  const searchParams = useSearchParams();
  const step = Number(searchParams.get('step'));
  const total = Number(searchParams.get('total'));
  if (!step || !total) return null;
  return <OnboardingProgressBar current={step} total={total} color={appSearchColor(app)} />;
}

/** Consistent themed frame for a per-app onboarding page — sets that app's
 * theme on mount, centers its content in a card, and shows the shared
 * bottom progress bar when reached via the onboarding sequence. Does not
 * own any skip/continue logic; each flow keeps its own (see the scope note
 * in the Foundation implementation plan, Task 9). */
export function OnboardingStepShell({ app, children }: OnboardingStepShellProps) {
  useEffect(() => {
    setAppTheme(app);
  }, [app]);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-5 shadow-sm">
        {children}
      </div>
      <Suspense fallback={null}>
        <ProgressFromParams app={app} />
      </Suspense>
    </div>
  );
}
