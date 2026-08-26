// app/(tasklog)/tasklog/page.tsx (placeholder, replaced in Task 14)
'use client';

import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';

export default function TaskLogDashboardPage() {
  return (
    <div className="pb-24">
      <TopBar title="TaskLog" />
      <div className="px-4 py-8 text-center text-muted-foreground">
        <p>Your dashboard is coming together.</p>
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
