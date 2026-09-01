// components/ui/stat-ring.tsx
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sm: 'size-16 text-sm',
  md: 'size-24 text-xl',
  lg: 'size-32 text-2xl',
} as const;

interface StatRingProps {
  value: number;
  min?: number;
  max?: number;
  size?: keyof typeof SIZE_CLASS;
  showValue?: boolean;
  className?: string;
}

/**
 * Themed AnimatedCircularProgressBar — same var(--primary)-based coloring
 * LogBook's DayScoreRing already pioneered, generalized for every app.
 */
export function StatRing({ value, min = 0, max = 100, size = 'md', showValue, className }: StatRingProps) {
  return (
    <AnimatedCircularProgressBar
      value={value}
      min={min}
      max={max}
      showValue={showValue}
      gaugePrimaryColor="var(--primary)"
      gaugeSecondaryColor="color-mix(in oklch, var(--primary) 15%, transparent)"
      className={cn(SIZE_CLASS[size], className)}
    />
  );
}
