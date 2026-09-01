// app/(tasklog)/tasklog/onboarding/page.tsx
'use client';

import { TaskLogOnboardingFlow } from './_components/TaskLogOnboardingFlow';

export default function TaskLogOnboardingPage() {
  return (
    <div className="min-h-screen px-4 py-6">
      <TaskLogOnboardingFlow />
    </div>
  );
}
