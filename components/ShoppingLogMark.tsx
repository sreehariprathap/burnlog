// components/ShoppingLogMark.tsx
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShoppingLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed orange, independent of the ambient theme — see TaskLogMark for why
// (this can render before .app-shoppinglog is applied, so `text-primary`
// would briefly show the wrong app's color). Cart glyph instead of a
// letterform since "shopping cart" reads more clearly than "S" (already
// used elsewhere) or "$" (easy to mistake for MoneyLog).
export function ShoppingLogMark({ size = 20, className }: ShoppingLogMarkProps) {
  return (
    <ShoppingCart
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#f18701' }}
      aria-hidden="true"
    />
  );
}
