// components/BurnLogMark.tsx
import { cn } from '@/lib/utils';

interface BurnLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed orange (#FF9E4F, BurnLog's root --primary), independent of the
// ambient theme — see MoneyLogMark for why: this can render from a page
// where another app's .app-* theme class is applied, so `text-primary`
// would resolve to the wrong app's color.
export function BurnLogMark({ size = 20, className }: BurnLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-[#FF9E4F]', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      B
    </span>
  );
}
