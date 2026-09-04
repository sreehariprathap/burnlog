// app/(intellog)/intellog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { IntelLogOnboardingFlow } from './_components/IntelLogOnboardingFlow';
import { OnboardingStepShell } from '@/components/onboarding/OnboardingStepShell';

export default function IntelLogOnboardingPage() {
  return (
    <OnboardingStepShell app="intellog">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <IntelLogOnboardingFlow />
      </Suspense>
    </OnboardingStepShell>
  );
}
