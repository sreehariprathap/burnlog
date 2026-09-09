'use client';

// components/HomeLogMark.tsx
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface HomeLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see MoneyLogMark for why: this can render before
// .app-homelog is applied, so `text-primary` would resolve to the wrong
// app's color. Plain letterform to match "B"/"L"/"T".
export function HomeLogMark({ size = 20, className }: HomeLogMarkProps) {
  const color = useAppSearchColor('homelog');
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color }}
      aria-hidden="true"
    >
      H
    </span>
  );
}
