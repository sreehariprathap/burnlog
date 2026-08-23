// components/LifeLogMark.tsx
import { cn } from '@/lib/utils';

interface LifeLogMarkProps {
  size?: number;
  className?: string;
}

export function LifeLogMark({ size = 20, className }: LifeLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-md bg-primary font-bold text-primary-foreground leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 0.65 }}
      aria-hidden="true"
    >
      L
    </span>
  );
}
