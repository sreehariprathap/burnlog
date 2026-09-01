// app/(tasklog)/tasklog/onboarding/page.tsx
'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { TaskLogOnboardingFlow } from './_components/TaskLogOnboardingFlow';

export default function TaskLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <TaskLogOnboardingFlow />
      </Suspense>
    </div>
  );
}
