import { describe, it, expect } from 'vitest';
import { buildAppContexts, type SnapshotRow, type CohortStatRow } from './chatContext';

describe('buildAppContexts', () => {
  it('takes the latest snapshot per app', () => {
    const snapshots: SnapshotRow[] = [
      { app: 'burnlog', date: '2026-09-01', metrics: { workoutsPerWeek: 2 } },
      { app: 'burnlog', date: '2026-09-02', metrics: { workoutsPerWeek: 4 } },
    ];
    const result = buildAppContexts(snapshots, []);
    expect(result).toEqual([{ app: 'burnlog', metrics: { workoutsPerWeek: 4 }, cohort: {} }]);
  });

  it('attaches matching cohort stats by app and metric', () => {
    const snapshots: SnapshotRow[] = [{ app: 'moneylog', date: '2026-09-01', metrics: { budgetPct: 82 } }];
    const cohortStats: CohortStatRow[] = [
      { app: 'moneylog', metric: 'budgetPct', p25: 40, p50: 60, p75: 80 },
      { app: 'burnlog', metric: 'workoutsPerWeek', p25: 1, p50: 3, p75: 5 },
    ];
    const result = buildAppContexts(snapshots, cohortStats);
    expect(result).toEqual([
      { app: 'moneylog', metrics: { budgetPct: 82 }, cohort: { budgetPct: { p25: 40, p50: 60, p75: 80 } } },
    ]);
  });

  it('returns an empty array when there are no snapshots', () => {
    expect(buildAppContexts([], [])).toEqual([]);
  });

  it('handles multiple apps independently', () => {
    const snapshots: SnapshotRow[] = [
      { app: 'burnlog', date: '2026-09-01', metrics: { workoutsPerWeek: 4 } },
      { app: 'moneylog', date: '2026-09-01', metrics: { budgetPct: 82 } },
    ];
    const result = buildAppContexts(snapshots, []);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.app).sort()).toEqual(['burnlog', 'moneylog']);
  });
});
