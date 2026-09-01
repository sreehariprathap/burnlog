// components/TravelLogMark.tsx
import { cn } from '@/lib/utils';

interface TravelLogMarkProps {
  size?: number;
  className?: string;
}

export function TravelLogMark({ size = 20, className }: TravelLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center leading-none', className)}
      style={{ width: size, height: size, fontSize: size }}
      aria-hidden="true"
    >
      🏖️
    </span>
  );
}
