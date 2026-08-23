// components/kokonutui/segmented-ring-card.tsx
'use client';

import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RingSegment {
  category: string;
  label: string;
  value: number;
  color: string;
}

interface SegmentedRingCardProps {
  title: string;
  /** Short context line under the title, e.g. the period's date range ("Aug 17 – Aug 23"). */
  subtitle?: string;
  /** Unit shown next to the total, e.g. "this week". */
  icon?: LucideIcon;
  iconClassName?: string;
  segments: RingSegment[];
  total: number;
  size?: number;
  className?: string;
}

export function SegmentedRingCard({ title, subtitle, icon: Icon, iconClassName, segments, total, size = 200, className }: SegmentedRingCardProps) {
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const positiveSegments = segments.filter((s) => s.value > 0);
  const hasData = total > 0 && positiveSegments.length > 0;

  let cumulative = 0;
  const arcs = hasData
    ? positiveSegments.map((seg) => {
        const fraction = seg.value / total;
        const arcLength = fraction * circumference;
        const offset = cumulative;
        cumulative += arcLength;
        return { ...seg, arcLength, offset };
      })
    : [];

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {Icon && <Icon className={cn('h-4 w-4', iconClassName)} />}
          {title}
        </span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90 transform" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <title>{`${title} breakdown`}</title>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-200/50 dark:text-zinc-800/50"
          />
          {hasData &&
            arcs.map((arc, index) => (
              <motion.circle
                key={arc.category}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${arc.arcLength} ${circumference - arc.arcLength}`}
                strokeDashoffset={-arc.offset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              />
            ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{hasData ? total.toLocaleString() : '—'}</span>
          <span className="text-xs text-muted-foreground">{hasData ? 'total' : 'No data yet'}</span>
        </div>
      </div>
      {hasData && (
        <ul className="w-full space-y-1">
          {positiveSegments.map((seg) => (
            <li key={seg.category} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                {seg.label}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-medium tabular-nums">{seg.value.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {total > 0 ? `${Math.round((seg.value / total) * 100)}%` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
