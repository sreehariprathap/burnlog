// app/(tasklog)/tasklog/board/_components/TaskCard.tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { PRIORITIES, type TaskRow } from '@/lib/tasklog/types';

interface TaskCardProps {
  task: TaskRow;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const priority = PRIORITIES.find((p) => p.id === task.priority);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card onClick={onClick} className="cursor-grab active:cursor-grabbing">
        <CardContent className="space-y-1.5 p-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priority?.color }} />
            <p className="text-sm font-medium leading-tight">{task.title}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{task.category}</span>
            {task.dueDate && <span>{task.dueDate}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
