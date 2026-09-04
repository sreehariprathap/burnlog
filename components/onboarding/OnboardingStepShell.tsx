'use client';

import { useEffect, type ReactNode } from 'react';
import { setAppTheme, type AppId } from '@/lib/appMode';

interface OnboardingStepShellProps {
  app: AppId;
  children: ReactNode;
}

/** Consistent themed frame for a per-app onboarding page — sets that app's
 * theme on mount and centers its content in a card. Does not own any
 * skip/continue logic; each flow keeps its own (see the scope note in the
 * Foundation implementation plan, Task 9). */
export function OnboardingStepShell({ app, children }: OnboardingStepShellProps) {
  useEffect(() => {
    setAppTheme(app);
  }, [app]);

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-5 shadow-sm">
        {children}
      </div>
    </div>
  );
}
