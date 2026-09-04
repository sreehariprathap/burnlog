// components/moneylog/AssetWalletCard.tsx
// A card-styled visual summary of a MoneyLog asset — inspired by kibo-ui's
// CreditCard (https://www.kibo-ui.com/components/credit-card), simplified
// to a single face with no fake card number/expiry/CVV, since this
// represents a savings/investment/cash/debt account, not a real payment
// card (see the Foundation-era decision: visual only, no real card data).
'use client';

import { formatCurrency } from '@/lib/format';
import { assetCategoryLabel } from '@/lib/moneylog/assetCategories';
import { cn } from '@/lib/utils';

const CATEGORY_GRADIENTS: Record<string, string> = {
  bank: 'from-blue-600 to-blue-900',
  investment: 'from-purple-600 to-purple-900',
  cash: 'from-emerald-600 to-emerald-900',
  debt: 'from-red-600 to-red-900',
  other: 'from-slate-600 to-slate-900',
};

interface AssetWalletCardProps {
  name: string;
  category: string;
  value: number;
  className?: string;
}

export function AssetWalletCard({ name, category, value, className }: AssetWalletCardProps) {
  const gradient = CATEGORY_GRADIENTS[category] ?? CATEGORY_GRADIENTS.other;

  return (
    <div
      className={cn(
        'relative aspect-[8560/5398] w-full max-w-96 overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg',
        gradient,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/70">
          {assetCategoryLabel(category)}
        </span>
        <div className="h-6 w-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500" aria-hidden="true" />
      </div>
      <p className="mt-6 truncate text-lg font-semibold uppercase" style={{ lineHeight: '100%' }}>
        {name}
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums" style={{ lineHeight: '100%' }}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
