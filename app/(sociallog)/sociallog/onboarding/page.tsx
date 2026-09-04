// app/(sociallog)/sociallog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { SocialLogOnboardingFlow } from './_components/SocialLogOnboardingFlow';
import { OnboardingStepShell } from '@/components/onboarding/OnboardingStepShell';

export default function SocialLogOnboardingPage() {
  return (
    <OnboardingStepShell app="sociallog">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <SocialLogOnboardingFlow />
      </Suspense>
    </OnboardingStepShell>
  );
}
