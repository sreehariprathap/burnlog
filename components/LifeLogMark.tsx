// components/LifeLogMark.tsx
import { cn } from '@/lib/utils';

interface LifeLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed green, independent of the ambient theme (`text-primary` would render
// orange when this is shown from a BurnLog page, since `.app-lifelog` isn't
// applied there and --primary still resolves to BurnLog's palette). Plain
// letterform to match how the BurnLog "B" mark (/B.png) reads — bold glyph,
// no background badge.
export function LifeLogMark({ size = 20, className }: LifeLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-emerald-500', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      L
    </span>
  );
}
