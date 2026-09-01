// lib/moneylog/assetCategories.ts
// Mirrors lib/financeCategories.ts's shape/pattern for the finance transaction categories.

export const ASSET_CATEGORIES = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'debt', label: 'Debt / Loan' },
  { value: 'other', label: 'Other' },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]['value'];

export function isAssetCategory(value: string): value is AssetCategory {
  return ASSET_CATEGORIES.some((c) => c.value === value);
}

export function assetCategoryLabel(category: string): string {
  const match = ASSET_CATEGORIES.find((c) => c.value === category);
  return match?.label ?? category;
}

/** Debt subtracts from net worth; every other category adds to it. */
export function isDebtCategory(category: string): boolean {
  return category === 'debt';
}
