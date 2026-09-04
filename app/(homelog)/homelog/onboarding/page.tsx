// app/(homelog)/homelog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { HomeLogOnboardingFlow } from './_components/HomeLogOnboardingFlow';
import { OnboardingStepShell } from '@/components/onboarding/OnboardingStepShell';

export default function HomeLogOnboardingPage() {
  return (
    <OnboardingStepShell app="homelog">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <HomeLogOnboardingFlow />
      </Suspense>
    </OnboardingStepShell>
  );
}
