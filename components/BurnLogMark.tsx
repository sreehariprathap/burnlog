'use client';

// components/BurnLogMark.tsx
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface BurnLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see MoneyLogMark for why: this can render from a page
// where another app's .app-* theme class is applied, so `text-primary`
// would resolve to the wrong app's color.
export function BurnLogMark({ size = 20, className }: BurnLogMarkProps) {
  const color = useAppSearchColor('burnlog');
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color }}
      aria-hidden="true"
    >
      B
    </span>
  );
}
