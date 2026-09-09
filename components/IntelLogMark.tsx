'use client';

// components/IntelLogMark.tsx
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface IntelLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of ambient
// theme — see TaskLogMark for why.
export function IntelLogMark({ size = 20, className }: IntelLogMarkProps) {
  const color = useAppSearchColor('intellog');
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color }}
      aria-hidden="true"
    >
      I
    </span>
  );
}
