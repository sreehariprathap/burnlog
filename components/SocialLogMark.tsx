// components/SocialLogMark.tsx
import { cn } from '@/lib/utils';

interface SocialLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed magenta, independent of the ambient theme — see TaskLogMark for why
// (this can render before .app-sociallog is applied, so `text-primary`
// would briefly show the wrong app's color).
export function SocialLogMark({ size = 20, className }: SocialLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color: '#9e0059' }}
      aria-hidden="true"
    >
      S
    </span>
  );
}
