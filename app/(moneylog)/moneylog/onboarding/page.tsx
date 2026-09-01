// app/(moneylog)/moneylog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { MoneyLogOnboardingFlow } from './_components/MoneyLogOnboardingFlow';

// Client Component — cannot export `metadata`; this flow has no persistent TopBar title.
export default function MoneyLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <MoneyLogOnboardingFlow />
      </Suspense>
    </div>
  );
}
