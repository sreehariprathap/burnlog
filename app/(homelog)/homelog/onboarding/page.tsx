// app/(homelog)/homelog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { HomeLogOnboardingFlow } from './_components/HomeLogOnboardingFlow';

export default function HomeLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <HomeLogOnboardingFlow />
      </Suspense>
    </div>
  );
}
