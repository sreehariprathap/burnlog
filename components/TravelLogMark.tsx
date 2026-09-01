// components/TravelLogMark.tsx
import { cn } from '@/lib/utils';

interface TravelLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed amber, independent of the ambient theme — see TaskLogMark for why.
export function TravelLogMark({ size = 20, className }: TravelLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-amber-500', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      V
    </span>
  );
}
