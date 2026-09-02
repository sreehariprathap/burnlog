import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { LearnLogOnboardingFlow } from './_components/LearnLogOnboardingFlow';

export const metadata: Metadata = { title: 'Set up LearnLog' };

export default function LearnLogOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <LearnLogOnboardingFlow />
    </Suspense>
  );
}
