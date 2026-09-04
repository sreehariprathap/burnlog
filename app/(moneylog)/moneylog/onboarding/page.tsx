// app/(moneylog)/moneylog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { MoneyLogOnboardingFlow } from './_components/MoneyLogOnboardingFlow';
import { OnboardingStepShell } from '@/components/onboarding/OnboardingStepShell';

// Client Component — cannot export `metadata`; this flow has no persistent TopBar title.
export default function MoneyLogOnboardingPage() {
  return (
    <OnboardingStepShell app="moneylog">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <MoneyLogOnboardingFlow />
      </Suspense>
    </OnboardingStepShell>
  );
}
