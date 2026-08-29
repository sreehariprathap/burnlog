// components/TaskLogMark.tsx
import { cn } from '@/lib/utils';

interface TaskLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed blue, independent of the ambient theme (`text-primary` would render
// the wrong app's color if this renders before .app-tasklog is applied) —
// see MoneyLogMark for why. Plain letterform to match "B" (/B.png) and "L".
export function TaskLogMark({ size = 20, className }: TaskLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-blue-500', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      T
    </span>
  );
}
