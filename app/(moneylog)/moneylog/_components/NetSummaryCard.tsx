// app/(moneylog)/moneylog/_components/NetSummaryCard.tsx
'use client';

import { TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

interface NetSummaryCardProps {
  income: number;
  expense: number;
}

export function NetSummaryCard({ income, expense }: NetSummaryCardProps) {
  const net = income - expense;
  return (
    <StatCard title="Net Balance" icon={Scale}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            Income
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(income)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
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
