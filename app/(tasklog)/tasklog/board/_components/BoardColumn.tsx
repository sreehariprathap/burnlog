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
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-muted/40 p-2">
      <p className="px-1 text-sm font-semibold text-muted-foreground">{lane.label}</p>
      <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
        {isEmpty ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">Drop tasks here</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
