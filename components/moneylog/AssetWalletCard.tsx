// components/moneylog/AssetWalletCard.tsx
// A card-styled visual summary of a MoneyLog asset — inspired by kibo-ui's
// CreditCard (https://www.kibo-ui.com/components/credit-card), simplified
// to a single face with no fake card number/expiry/CVV, since this
// represents a savings/investment/cash/debt account, not a real payment
// card (see the Foundation-era decision: visual only, no real card data).
'use client';

import { formatCurrency } from '@/lib/format';
import { assetCategoryLabel } from '@/lib/moneylog/assetCategories';
import { glowGradient } from '@/lib/theme/glowPalette';
import { cn } from '@/lib/utils';

// Stable per-category index into the shared chart palette (glowGradient) —
// categories stay visually distinct from each other, but draw from the
// same 5-color palette every other identity-gradient card uses instead of
// each card inventing its own hex values.
const CATEGORY_ORDER = ['bank', 'investment', 'cash', 'debt', 'other'] as const;

function categoryIndex(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
  return i === -1 ? CATEGORY_ORDER.length - 1 : i;
}

interface AssetWalletCardProps {
  name: string;
  category: string;
  value: number;
  className?: string;
}

export function AssetWalletCard({ name, category, value, className }: AssetWalletCardProps) {
  return (
    <div
      className={cn('relative aspect-[8560/5398] w-full max-w-96 overflow-hidden rounded-2xl p-5 text-white shadow-lg', className)}
      style={{ background: glowGradient(categoryIndex(category)) }}
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
