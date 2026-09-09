'use client';

// components/TaskLogMark.tsx
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface TaskLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme (`text-primary` would render the wrong app's color if this
// renders before .app-tasklog is applied) — see MoneyLogMark for why.
// Plain letterform to match "B" (/B.png) and "L".
export function TaskLogMark({ size = 20, className }: TaskLogMarkProps) {
  const color = useAppSearchColor('tasklog');
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color }}
      aria-hidden="true"
    >
      T
    </span>
  );
}
