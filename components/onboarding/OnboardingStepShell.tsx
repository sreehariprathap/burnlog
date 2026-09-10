'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { setAppTheme, type AppId } from '@/lib/appMode';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';
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
  const color = useAppSearchColor(app);
  if (!step || !total) return null;
  return <OnboardingProgressBar current={step} total={total} color={color} />;
}

/** Consistent themed frame for a per-app onboarding page — sets that app's
 * theme on mount, centers its content column, and shows the shared bottom
 * progress bar when reached via the onboarding sequence. Renders no card
 * chrome of its own — every step component supplies its own `<Card>`, so
 * this shell only owns width/centering to avoid a card-in-a-card look. Does
 * not own any skip/continue logic; each flow keeps its own (see the scope
 * note in the Foundation implementation plan, Task 9). */
export function OnboardingStepShell({ app, children }: OnboardingStepShellProps) {
  useEffect(() => {
    setAppTheme(app);
  }, [app]);

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="mx-auto w-full max-w-md">
        {children}
      </div>
      <Suspense fallback={null}>
        <ProgressFromParams app={app} />
      </Suspense>
    </div>
  );
}
