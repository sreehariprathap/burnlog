'use client';

// components/TravelLogMark.tsx
import { PalmtreeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface TravelLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see TaskLogMark for why.
export function TravelLogMark({ size = 20, className }: TravelLogMarkProps) {
  const color = useAppSearchColor('travellog');
  return (
    <PalmtreeIcon
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color }}
      aria-hidden="true"
    />
  );
}
