// app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx
'use client';

import { Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface NetWorthSummaryCardProps {
  netWorth: number;
  assetCount: number;
}

// Same gradient-card visual language as AssetWalletCard (kibo-ui's
// CreditCard, simplified) — this is the aggregate across every asset, so it
// gets its own distinct (brand-toned) gradient rather than any one asset
// category's.
export function NetWorthSummaryCard({ netWorth, assetCount }: NetWorthSummaryCardProps) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-950 p-5 text-white shadow-lg',
        netWorth < 0 && 'from-red-600 to-red-950'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/70">
          Net Worth
        </span>
        <Wallet className="h-5 w-5 text-white/70" aria-hidden="true" />
      </div>
      <p className="mt-6 font-mono text-3xl font-semibold tabular-nums" style={{ lineHeight: '100%' }}>
        {formatCurrency(netWorth)}
      </p>
      <p className="mt-2 text-xs text-white/70">
        Across {assetCount} asset{assetCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
