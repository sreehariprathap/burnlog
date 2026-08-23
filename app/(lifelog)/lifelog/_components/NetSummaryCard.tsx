// app/(lifelog)/lifelog/_components/NetSummaryCard.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface NetSummaryCardProps {
  income: number;
  expense: number;
}

export function NetSummaryCard({ income, expense }: NetSummaryCardProps) {
  const net = income - expense;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="font-semibold">{income.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expense</p>
          <p className="font-semibold">{expense.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Net</p>
          <p className={cn('font-semibold', net >= 0 ? 'text-emerald-500' : 'text-destructive')}>
            {net.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
