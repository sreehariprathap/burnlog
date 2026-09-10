import { describe, it, expect } from 'vitest';
import { computeBucketBalance, computeBucketProgress } from './buckets';

describe('computeBucketBalance', () => {
  it('sums contributions and subtracts withdrawals', () => {
    const balance = computeBucketBalance([
      { type: 'contribution', amount: 100 },
      { type: 'contribution', amount: 50 },
      { type: 'withdrawal', amount: 30 },
    ]);
    expect(balance).toBe(120);
  });

  it('returns 0 for no entries', () => {
    expect(computeBucketBalance([])).toBe(0);
  });
});

describe('computeBucketProgress', () => {
  it('returns the fraction of target reached', () => {
    expect(computeBucketProgress(50, 200)).toBe(0.25);
  });

  it('clamps at 1 when balance exceeds target', () => {
    expect(computeBucketProgress(300, 200)).toBe(1);
  });

  it('returns null when there is no target', () => {
    expect(computeBucketProgress(50, null)).toBeNull();
  });
});
