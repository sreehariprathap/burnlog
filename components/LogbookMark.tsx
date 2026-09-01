// components/LogbookMark.tsx
import { cn } from '@/lib/utils';

interface LogbookMarkProps {
  size?: number;
  className?: string;
}

// Fixed indigo (#2D52B3, Logbook's --primary), independent of the ambient
// theme — see MoneyLogMark for why: this can render before .app-logbook is
// applied.
export function LogbookMark({ size = 20, className }: LogbookMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-[#2D52B3]', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      L
    </span>
  );
}
