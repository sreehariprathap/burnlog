// components/ShoppingLogMark.tsx
import { cn } from '@/lib/utils';

interface ShoppingLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed orange, independent of the ambient theme — see TaskLogMark for why
// (this can render before .app-shoppinglog is applied, so `text-primary`
// would briefly show the wrong app's color).
export function ShoppingLogMark({ size = 20, className }: ShoppingLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color: '#f18701' }}
      aria-hidden="true"
    >
      $
    </span>
  );
}
