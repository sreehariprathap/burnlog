// app/(watchlog)/watchlog/onboarding/page.tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { WatchLogOnboardingFlow } from './_components/WatchLogOnboardingFlow';

export const metadata: Metadata = { title: 'Set up WatchLog' };

export default function WatchLogOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <WatchLogOnboardingFlow />
    </Suspense>
  );
}
