// app/(tasklog)/tasklog/goals/page.tsx (placeholder, replaced in Task 16)
'use client';

import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';

export default function GoalsPage() {
  return (
    <div className="pb-24">
      <TopBar title="Goals" />
      <div className="px-4 py-8 text-center text-muted-foreground">
        <p>Goals are coming together.</p>
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
