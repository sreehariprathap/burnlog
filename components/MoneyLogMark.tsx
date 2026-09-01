// components/MoneyLogMark.tsx
import { cn } from '@/lib/utils';

interface MoneyLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed green, independent of the ambient theme (`text-primary` would render
// orange when this is shown from a BurnLog page, since `.app-moneylog` isn't
// applied there and --primary still resolves to BurnLog's palette). Plain
// letterform to match the other apps' marks — bold glyph, no background badge.
export function MoneyLogMark({ size = 20, className }: MoneyLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-emerald-500', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      M
    </span>
  );
}
