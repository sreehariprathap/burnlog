// app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx
'use client';

import { Wallet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface NetWorthSummaryCardProps {
  netWorth: number;
  assetCount: number;
}

export function NetWorthSummaryCard({ netWorth, assetCount }: NetWorthSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Wallet className="h-4 w-4" />
          Net Worth
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn('text-3xl font-semibold tabular-nums', netWorth < 0 && 'text-destructive')}>
          {formatCurrency(netWorth)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Across {assetCount} asset{assetCount === 1 ? '' : 's'}
        </p>
      </CardContent>
    </Card>
  );
}
