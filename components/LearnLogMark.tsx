// components/LearnLogMark.tsx
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LearnLogMarkProps {
  size?: number;
  className?: string;
}

export function LearnLogMark({ size = 20, className }: LearnLogMarkProps) {
  return (
    <GraduationCap
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#7C3AED' }}
      aria-hidden="true"
    />
  );
}
