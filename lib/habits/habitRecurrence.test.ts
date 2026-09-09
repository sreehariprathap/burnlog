import { describe, it, expect } from 'vitest';
import { computeOccurrenceDates, computeMissingOccurrences, type HabitRecurrenceFields } from './habitRecurrence';

function habit(overrides: Partial<HabitRecurrenceFields>): HabitRecurrenceFields {
  return {
    recurrenceType: 'once',
    daysOfWeek: [],
    intervalWeeks: 1,
    endType: 'never',
    endDate: null,
    endCount: null,
    startDate: '2026-09-08',
    ...overrides,
  };
}

describe('computeOccurrenceDates', () => {
  it('returns the single start date for a one-time habit within range', () => {
    const h = habit({ recurrenceType: 'once', startDate: '2026-09-10' });
    expect(computeOccurrenceDates(h, '2026-09-01', '2026-09-30')).toEqual(['2026-09-10']);
  });

  it('excludes a one-time habit whose date falls outside the range', () => {
    const h = habit({ recurrenceType: 'once', startDate: '2026-10-01' });
    expect(computeOccurrenceDates(h, '2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('returns every date for a daily habit within range', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08' });
    expect(computeOccurrenceDates(h, '2026-09-08', '2026-09-10')).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('returns only the selected weekdays for a weekly Mon-Fri habit', () => {
    // 2026-09-08 is a Tuesday
    const h = habit({ recurrenceType: 'weekly', startDate: '2026-09-08', daysOfWeek: [1, 2, 3, 4, 5] });
    const dates = computeOccurrenceDates(h, '2026-09-08', '2026-09-14');
    expect(dates).toEqual(['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14']);
  });

  it('honors an every-N-weeks interval', () => {
    // 2026-09-07 is a Monday. Every 2 weeks on Monday.
    const h = habit({ recurrenceType: 'weekly', startDate: '2026-09-07', daysOfWeek: [1], intervalWeeks: 2 });
    const dates = computeOccurrenceDates(h, '2026-09-07', '2026-10-05');
    expect(dates).toEqual(['2026-09-07', '2026-09-21', '2026-10-05']);
  });

  it('stops at an on_date end condition', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08', endType: 'on_date', endDate: '2026-09-10' });
    expect(computeOccurrenceDates(h, '2026-09-08', '2026-09-30')).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('stops after N occurrences with an after_n end condition', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08', endType: 'after_n', endCount: 2 });
    expect(computeOccurrenceDates(h, '2026-09-08', '2026-09-30')).toEqual(['2026-09-08', '2026-09-09']);
  });
});

describe('computeMissingOccurrences', () => {
  it('filters out dates already present', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08' });
    const missing = computeMissingOccurrences(h, ['2026-09-08', '2026-09-09'], '2026-09-08', '2026-09-10');
    expect(missing).toEqual(['2026-09-10']);
  });
});
