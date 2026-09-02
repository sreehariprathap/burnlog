// components/AdminLogMark.tsx
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed slate, independent of the ambient theme — see TaskLogMark for why.
// Shield glyph (not a letterform) to read as "admin/moderation" at a glance.
export function AdminLogMark({ size = 20, className }: AdminLogMarkProps) {
  return (
    <ShieldCheck
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#475569' }}
      aria-hidden="true"
    />
  );
}
