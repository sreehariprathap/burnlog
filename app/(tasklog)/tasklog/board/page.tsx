// app/(tasklog)/tasklog/board/page.tsx (placeholder, replaced in Task 11)
'use client';

import { TopBar } from '@/components/TopBar';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';

export default function BoardPage() {
  return (
    <div className="pb-24">
      <TopBar title="Board" />
      <div className="px-4 py-8 text-center text-muted-foreground">
        <p>The board is coming together.</p>
      </div>
      <TaskLogBottomNav />
    </div>
  );
}
