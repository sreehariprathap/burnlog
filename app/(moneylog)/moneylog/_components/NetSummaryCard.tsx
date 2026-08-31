// app/(moneylog)/moneylog/_components/NetSummaryCard.tsx
'use client';

import { TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

interface NetSummaryCardProps {
  income: number;
  expense: number;
}

export function NetSummaryCard({ income, expense }: NetSummaryCardProps) {
  const net = income - expense;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Scale className="h-4 w-4" />
          Net Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            Income
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(income)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            Expense
          </span>
          <p className="font-semibold tabular-nums">{formatCurrency(expense)}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-muted-foreground">Net</span>
          <p className={cn('font-semibold tabular-nums', net >= 0 ? 'text-emerald-500' : 'text-destructive')}>
            {formatCurrency(net)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
