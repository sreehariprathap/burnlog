// app/(tasklog)/tasklog/board/_components/BoardColumn.tsx
'use client';

import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { LaneMeta } from '@/lib/tasklog/types';

interface BoardColumnProps {
  lane: LaneMeta;
  children: ReactNode;
}

export function BoardColumn({ lane, children }: BoardColumnProps) {
  const { setNodeRef } = useDroppable({ id: lane.id });

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2">
      <p className="px-1 text-sm font-semibold text-muted-foreground">{lane.label}</p>
      <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
        {children}
      </div>
    </div>
  );
}
