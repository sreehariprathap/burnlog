// app/(tasklog)/tasklog/plan/page.tsx (placeholder, replaced in Task 13)
'use client';

import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';

export default function PlanPage() {
  return (
    <div className="pb-24">
      <TopBar title="Plan" />
      <div className="px-4 py-8 text-center text-muted-foreground">
        <p>Your inbox is coming together.</p>
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
