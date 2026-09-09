'use client';

// components/LearnLogMark.tsx
import { Blocks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface LearnLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see TaskLogMark for why.
export function LearnLogMark({ size = 20, className }: LearnLogMarkProps) {
  const color = useAppSearchColor('learnlog');
  return (
    <Blocks
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color }}
      aria-hidden="true"
    />
  );
}
