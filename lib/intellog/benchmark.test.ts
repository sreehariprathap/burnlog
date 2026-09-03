import { describe, it, expect } from 'vitest';
import { mergeBenchmarkSeries } from './benchmark';

describe('mergeBenchmarkSeries', () => {
  it('merges a date present on both sides', () => {
    const result = mergeBenchmarkSeries(
      [{ date: '2026-09-01', value: 4 }],
      [{ date: '2026-09-01', p25: 2, p50: 4, p75: 6 }]
    );
    expect(result).toEqual([{ date: '2026-09-01', own: 4, p25: 2, p50: 4, p75: 6 }]);
  });

  it('fills cohort fields with null when a date only has an own value', () => {
    const result = mergeBenchmarkSeries([{ date: '2026-09-01', value: 4 }], []);
    expect(result).toEqual([{ date: '2026-09-01', own: 4, p25: null, p50: null, p75: null }]);
  });

  it('fills own with null when a date only has cohort data', () => {
    const result = mergeBenchmarkSeries([], [{ date: '2026-09-01', p25: 2, p50: 4, p75: 6 }]);
    expect(result).toEqual([{ date: '2026-09-01', own: null, p25: 2, p50: 4, p75: 6 }]);
  });

  it('sorts merged dates ascending', () => {
    const result = mergeBenchmarkSeries(
      [
        { date: '2026-09-03', value: 6 },
        { date: '2026-09-01', value: 4 },
      ],
      []
    );
    expect(result.map((r) => r.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('returns an empty array when there is no data on either side', () => {
    expect(mergeBenchmarkSeries([], [])).toEqual([]);
  });
});
