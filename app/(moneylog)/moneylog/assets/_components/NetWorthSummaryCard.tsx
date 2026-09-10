// app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx
'use client';

import { Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface NetWorthSummaryCardProps {
  netWorth: number;
  assetCount: number;
}

// Same gradient-card visual language as AssetWalletCard (kibo-ui's
// CreditCard, simplified) — this is a binary status signal (positive vs.
// negative), not an arbitrary category, so it stays on the existing
// semantic --success/--destructive tokens rather than the category hue
// palette AssetWalletCard uses.
export function NetWorthSummaryCard({ netWorth, assetCount }: NetWorthSummaryCardProps) {
  const tone = netWorth < 0 ? 'var(--destructive)' : 'var(--success)';
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl p-5 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${tone}, color-mix(in oklch, ${tone}, black 35%))` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/70">Net Worth</span>
        <Wallet className="h-5 w-5 text-white/70" aria-hidden="true" />
      </div>
      <p className="mt-6 font-mono text-heading-4 font-semibold tabular-nums">
        {formatCurrency(netWorth)}
      </p>
      <p className="mt-2 text-xs text-white/70">
        Across {assetCount} asset{assetCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
