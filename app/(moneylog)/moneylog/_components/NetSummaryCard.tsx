// app/(moneylog)/moneylog/_components/NetSummaryCard.tsx
'use client';

import { useRef } from 'react';
import { Scale } from 'lucide-react';
import { TrendingUpIcon, type TrendingUpIconHandle } from '@/components/ui/trending-up';
import { TrendingDownIcon, type TrendingDownIconHandle } from '@/components/ui/trending-down';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

interface NetSummaryCardProps {
  income: number;
  expense: number;
}

export function NetSummaryCard({ income, expense }: NetSummaryCardProps) {
  const net = income - expense;
  const upIconRef = useRef<TrendingUpIconHandle>(null);
  const downIconRef = useRef<TrendingDownIconHandle>(null);
  useMountAnimation(upIconRef);
  useMountAnimation(downIconRef);

  return (
    <StatCard title="Net Balance" icon={Scale}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUpIcon ref={upIconRef} size={14} className="text-success" />
            Income
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(income)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDownIcon ref={downIconRef} size={14} className="text-destructive" />
            Expense
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(expense)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-muted-foreground">Net</span>
          <p className={cn('font-semibold tabular-nums', net >= 0 ? 'text-success' : 'text-destructive')}>
            {formatCurrency(net)}
          </p>
        </div>
      </div>
    </StatCard>
  );
}
