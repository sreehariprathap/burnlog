'use client';

// components/AdminLogMark.tsx
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSearchColor } from '@/lib/search/useAppSearchColor';

interface AdminLogMarkProps {
  size?: number;
  className?: string;
}

// Live per-app color (AdminLog > UI > App Theme), independent of the
// ambient theme — see TaskLogMark for why. Shield glyph (not a letterform)
// to read as "admin/moderation" at a glance.
export function AdminLogMark({ size = 20, className }: AdminLogMarkProps) {
  const color = useAppSearchColor('adminlog');
  return (
    <ShieldCheck
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color }}
      aria-hidden="true"
    />
  );
}
