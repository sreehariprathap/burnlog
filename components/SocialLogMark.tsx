'use client';

// components/SocialLogMark.tsx
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface SocialLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see TaskLogMark for why (this can render before
// .app-sociallog is applied, so `text-primary` would briefly show the
// wrong app's color).
export function SocialLogMark({ size = 20, className }: SocialLogMarkProps) {
  const color = useAppSearchColor('sociallog');
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color }}
      aria-hidden="true"
    >
      S
    </span>
  );
}
