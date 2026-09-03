// components/kokonutui/dual-ring-card.tsx
'use client';

import { useRef } from 'react';
import { motion } from 'motion/react';
import { Scale } from 'lucide-react';
import { TrendingUpIcon, type TrendingUpIconHandle } from '@/components/ui/trending-up';
import { TrendingDownIcon, type TrendingDownIconHandle } from '@/components/ui/trending-down';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { cn } from '@/lib/utils';
import type { RingSegment } from './segmented-ring-card';

interface DualRingCardProps {
  /** Short context line under the title, e.g. the period's date range. */
  subtitle?: string;
  incomeSegments: RingSegment[];
  incomeTotal: number;
  expenseSegments: RingSegment[];
  expenseTotal: number;
  size?: number;
  className?: string;
}

function buildArcs(segments: RingSegment[], total: number, radius: number) {
  const circumference = radius * 2 * Math.PI;
  const positive = segments.filter((s) => s.value > 0);
  const hasData = total > 0 && positive.length > 0;

  let cumulative = 0;
  const arcs = hasData
    ? positive.map((seg) => {
        const fraction = seg.value / total;
        const arcLength = fraction * circumference;
        const offset = cumulative;
        cumulative += arcLength;
        return { ...seg, arcLength, offset };
      })
    : [];

  return { arcs, circumference, hasData, positive };
}

function RingLegend({ title, variant, iconClassName, segments, total }: {
  title: string;
  variant: 'income' | 'expense';
  iconClassName: string;
  segments: RingSegment[];
  total: number;
}) {
  const upRef = useRef<TrendingUpIconHandle>(null);
  const downRef = useRef<TrendingDownIconHandle>(null);
  useMountAnimation(upRef);
  useMountAnimation(downRef);
  const positive = segments.filter((s) => s.value > 0);
  return (
    <div className="flex-1 space-y-1.5 min-w-0">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {variant === 'income' ? (
          <TrendingUpIcon ref={upRef} size={14} className={iconClassName} />
        ) : (
          <TrendingDownIcon ref={downRef} size={14} className={iconClassName} />
        )}
        {title}
      </span>
      {positive.length > 0 ? (
        <ul className="space-y-1">
          {positive.map((seg) => (
            <li key={seg.category} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                <span className="truncate">{seg.label}</span>
              </span>
              <span className="flex items-baseline gap-1 shrink-0">
                <span className="font-medium tabular-nums">{seg.value.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {total > 0 ? `${Math.round((seg.value / total) * 100)}%` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No data yet</p>
      )}
    </div>
  );
}

export function DualRingCard({
  subtitle,
  incomeSegments,
  incomeTotal,
  expenseSegments,
  expenseTotal,
  size = 220,
  className,
}: DualRingCardProps) {
  const strokeWidth = 18;
  const gap = 6;
  const outerRadius = (size - strokeWidth) / 2;
  const innerRadius = outerRadius - strokeWidth - gap;

  const outer = buildArcs(incomeSegments, incomeTotal, outerRadius);
  const inner = buildArcs(expenseSegments, expenseTotal, innerRadius);

  const net = incomeTotal - expenseTotal;

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-sm font-semibold">Income &amp; Expenses</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90 transform" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <title>Income and expense breakdown</title>
          {/* Outer track (income) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={outerRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-200/50 dark:text-zinc-800/50"
          />
          {outer.hasData &&
            outer.arcs.map((arc, index) => (
              <motion.circle
                key={`income-${arc.category}`}
                cx={size / 2}
                cy={size / 2}
                r={outerRadius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${arc.arcLength} ${outer.circumference - arc.arcLength}`}
                strokeDashoffset={-arc.offset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              />
            ))}

          {/* Inner track (expense) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={innerRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-200/50 dark:text-zinc-800/50"
          />
          {inner.hasData &&
            inner.arcs.map((arc, index) => (
              <motion.circle
                key={`expense-${arc.category}`}
                cx={size / 2}
                cy={size / 2}
                r={innerRadius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${arc.arcLength} ${inner.circumference - arc.arcLength}`}
                strokeDashoffset={-arc.offset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.1 + index * 0.1 }}
              />
            ))}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn('text-xl font-bold tabular-nums', net >= 0 ? 'text-success' : 'text-destructive')}>
            {net.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground">net</span>
        </div>
      </div>

      <div className="flex w-full gap-4">
        <RingLegend title="Income" variant="income" iconClassName="text-success" segments={incomeSegments} total={incomeTotal} />
        <div className="w-px self-stretch bg-border" />
        <RingLegend title="Expenses" variant="expense" iconClassName="text-destructive" segments={expenseSegments} total={expenseTotal} />
      </div>
    </div>
  );
}
