// components/TravelLogMark.tsx
import { PalmtreeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TravelLogMarkProps {
  size?: number;
  className?: string;
}

export function TravelLogMark({ size = 20, className }: TravelLogMarkProps) {
  return (
    <PalmtreeIcon
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#0077BE' }}
      aria-hidden="true"
    />
  );
}
