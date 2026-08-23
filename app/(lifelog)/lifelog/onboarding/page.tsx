// app/(lifelog)/lifelog/onboarding/page.tsx
'use client';

import { LifeLogOnboardingFlow } from './_components/LifeLogOnboardingFlow';

export default function LifeLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <LifeLogOnboardingFlow />
    </div>
  );
}
