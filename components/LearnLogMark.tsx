// components/LearnLogMark.tsx
import { Blocks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LearnLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed crimson (#FF3366, LearnLog's --primary), independent of the ambient
// theme — see TaskLogMark for why.
export function LearnLogMark({ size = 20, className }: LearnLogMarkProps) {
  return (
    <Blocks
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#FF3366' }}
      aria-hidden="true"
    />
  );
}
