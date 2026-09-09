'use client';

// components/LogbookMark.tsx
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface LogbookMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see MoneyLogMark for why: this can render before
// .app-logbook is applied.
export function LogbookMark({ size = 20, className }: LogbookMarkProps) {
  const color = useAppSearchColor('logbook');
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color }}
      aria-hidden="true"
    >
      L
    </span>
  );
}
