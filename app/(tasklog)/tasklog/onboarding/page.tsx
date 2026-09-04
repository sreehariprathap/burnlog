// app/(tasklog)/tasklog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { TaskLogOnboardingFlow } from './_components/TaskLogOnboardingFlow';
import { OnboardingStepShell } from '@/components/onboarding/OnboardingStepShell';

export default function TaskLogOnboardingPage() {
  return (
    <OnboardingStepShell app="tasklog">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <TaskLogOnboardingFlow />
      </Suspense>
    </OnboardingStepShell>
  );
}
