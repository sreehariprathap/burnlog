// components/TravelLogMark.tsx
import { Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TravelLogMarkProps {
  size?: number;
  className?: string;
}

export function TravelLogMark({ size = 20, className }: TravelLogMarkProps) {
  return (
    <Waves
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#0077BE' }}
      aria-hidden="true"
    />
  );
}
