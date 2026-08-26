// components/HomeLogMark.tsx
import { cn } from '@/lib/utils';

interface HomeLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed terracotta, independent of the ambient theme — see LifeLogMark for
// why: this can render before .app-homelog is applied, so `text-primary`
// would resolve to the wrong app's color. Plain letterform to match "B"/"L"/"T".
export function HomeLogMark({ size = 20, className }: HomeLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-amber-700', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      H
    </span>
  );
}
