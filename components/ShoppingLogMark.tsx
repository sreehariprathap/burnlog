'use client';

// components/ShoppingLogMark.tsx
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface ShoppingLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see TaskLogMark for why (this can render before
// .app-shoppinglog is applied, so `text-primary` would briefly show the
// wrong app's color). Cart glyph instead of a letterform since "shopping
// cart" reads more clearly than "S" (already used elsewhere) or "$" (easy
// to mistake for MoneyLog).
export function ShoppingLogMark({ size = 20, className }: ShoppingLogMarkProps) {
  const color = useAppSearchColor('shoppinglog');
  return (
    <ShoppingCart
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color }}
      aria-hidden="true"
    />
  );
}
