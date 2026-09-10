// lib/moneylog/buckets.ts
//
// Pure computation over a SavingsBucket's BucketEntry ledger. Balance and
// target progress are always derived here, never stored on savings_buckets —
// see the design doc's "Data model" section for why.

export interface BucketEntryRow {
  type: 'contribution' | 'withdrawal';
  amount: number;
}

export function computeBucketBalance(entries: BucketEntryRow[]): number {
  return entries.reduce((sum, entry) => sum + (entry.type === 'contribution' ? entry.amount : -entry.amount), 0);
}

export function computeBucketProgress(balance: number, targetAmount: number | null): number | null {
  if (targetAmount === null || targetAmount <= 0) return null;
  return Math.min(balance / targetAmount, 1);
}
