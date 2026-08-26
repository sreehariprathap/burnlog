// components/TaskLogMark.tsx
import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed blue, independent of the ambient theme — see LifeLogMark for why:
// this can render from a BurnLog/LifeLog page before .app-tasklog is
// applied, so `text-primary` would resolve to the wrong app's color.
export function TaskLogMark({ size = 20, className }: TaskLogMarkProps) {
  return (
    <ListChecks
      className={cn('text-blue-500', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
