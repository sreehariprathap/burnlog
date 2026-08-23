// components/LifeLogMark.tsx
import { cn } from '@/lib/utils';

interface LifeLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed green, independent of the ambient theme (`bg-primary` would render
// orange when this is shown from a BurnLog page, since `.app-lifelog` isn't
// applied there and --primary still resolves to BurnLog's palette).
export function LifeLogMark({ size = 20, className }: LifeLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-md border-0 bg-emerald-500 font-bold text-white leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 0.65 }}
      aria-hidden="true"
    >
      L
    </span>
  );
}
