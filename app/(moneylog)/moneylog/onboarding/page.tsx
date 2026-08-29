// app/(moneylog)/moneylog/onboarding/page.tsx
'use client';

import { MoneyLogOnboardingFlow } from './_components/MoneyLogOnboardingFlow';

export default function MoneyLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <MoneyLogOnboardingFlow />
    </div>
  );
}
