// components/IntelLogMark.tsx
import { cn } from '@/lib/utils';

interface IntelLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed color, independent of ambient theme — see TaskLogMark for why.
export function IntelLogMark({ size = 20, className }: IntelLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-violet-500', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      I
    </span>
  );
}
