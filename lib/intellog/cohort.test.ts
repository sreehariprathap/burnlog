import { describe, it, expect } from 'vitest';
import { ageBucket, buildCohortKey, computePercentiles, MIN_COHORT_SAMPLE_SIZE } from './cohort';

describe('ageBucket', () => {
  it('buckets ages into 10-year ranges with a top-open bucket', () => {
    expect(ageBucket(19)).toBe('<25');
    expect(ageBucket(24)).toBe('<25');
    expect(ageBucket(25)).toBe('25-34');
    expect(ageBucket(34)).toBe('25-34');
    expect(ageBucket(35)).toBe('35-44');
    expect(ageBucket(45)).toBe('45-54');
    expect(ageBucket(55)).toBe('55+');
    expect(ageBucket(80)).toBe('55+');
  });
});

describe('buildCohortKey', () => {
  it('combines goal type, age bucket, and country', () => {
    expect(buildCohortKey('lose_weight', 28, 'CA')).toBe('goal:lose_weight|age:25-34|country:CA');
  });

  it('falls back to "general" when goalType is null, and "any" when country is omitted', () => {
    expect(buildCohortKey(null, 40)).toBe('goal:general|age:35-44|country:any');
  });
});

describe('computePercentiles', () => {
  it('returns null for an empty array', () => {
    expect(computePercentiles([])).toBeNull();
  });

  it('computes p25/p50/p75 with linear interpolation over a sorted array', () => {
    const values = Array.from({ length: 21 }, (_, i) => i + 1); // 1..21
    const result = computePercentiles(values);
    expect(result).not.toBeNull();
    expect(result!.p50).toBe(11);
    expect(result!.p25).toBeCloseTo(6, 0);
    expect(result!.p75).toBeCloseTo(16, 0);
  });

  it('is order-independent (sorts input internally)', () => {
    const sorted = computePercentiles([1, 2, 3, 4, 5]);
    const shuffled = computePercentiles([5, 3, 1, 4, 2]);
    expect(shuffled).toEqual(sorted);
  });
});

describe('MIN_COHORT_SAMPLE_SIZE', () => {
  it('is 20', () => {
    expect(MIN_COHORT_SAMPLE_SIZE).toBe(20);
  });
});
