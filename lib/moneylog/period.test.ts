import { describe, it, expect } from 'vitest';
import { getMonthRange, getYearRange, getWeekRange, getPeriodConfig, DEFAULT_PERIOD_CONFIG } from './period';

// Local-time Y-M-D, matching how the period functions operate (date-fns's
// setDate/addMonths/startOfWeek all work in local wall-clock time) — using
// toISOString() here would silently shift by the runner's UTC offset.
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('getMonthRange', () => {
  it('is a plain calendar month when monthStartDay is 1 (default)', () => {
    const { start, end } = getMonthRange(new Date(2026, 5, 15), DEFAULT_PERIOD_CONFIG);
    expect(ymd(start)).toBe('2026-06-01');
    expect(ymd(end)).toBe('2026-06-30');
  });

  it('shifts the window when monthStartDay is mid-month and the date is past it', () => {
    const { start, end } = getMonthRange(new Date(2026, 5, 20), { ...DEFAULT_PERIOD_CONFIG, monthStartDay: 15 });
    expect(ymd(start)).toBe('2026-06-15');
    expect(ymd(end)).toBe('2026-07-14');
  });

  it('rolls back to the previous month when the date is before monthStartDay', () => {
    const { start, end } = getMonthRange(new Date(2026, 5, 10), { ...DEFAULT_PERIOD_CONFIG, monthStartDay: 15 });
    expect(ymd(start)).toBe('2026-05-15');
    expect(ymd(end)).toBe('2026-06-14');
  });
});

describe('getYearRange', () => {
  it('is a plain calendar year when yearStartMonth is 1 (default)', () => {
    const { start, end } = getYearRange(new Date(2026, 5, 15), DEFAULT_PERIOD_CONFIG);
    expect(ymd(start)).toBe('2026-01-01');
    expect(ymd(end)).toBe('2026-12-31');
  });

  it('rolls back to the previous fiscal year when the date is before the start month', () => {
    const { start, end } = getYearRange(new Date(2027, 1, 1), { ...DEFAULT_PERIOD_CONFIG, yearStartMonth: 4 });
    expect(ymd(start)).toBe('2026-04-01');
    expect(ymd(end)).toBe('2027-03-31');
  });

  it('uses the current fiscal year when the date is on/after the start month', () => {
    const { start, end } = getYearRange(new Date(2026, 4, 1), { ...DEFAULT_PERIOD_CONFIG, yearStartMonth: 4 });
    expect(ymd(start)).toBe('2026-04-01');
    expect(ymd(end)).toBe('2027-03-31');
  });
});

describe('getWeekRange', () => {
  it('defaults to Monday-Sunday', () => {
    // 2026-06-17 is a Wednesday
    const { start, end } = getWeekRange(new Date(2026, 5, 17), DEFAULT_PERIOD_CONFIG);
    expect(ymd(start)).toBe('2026-06-15'); // Monday
    expect(ymd(end)).toBe('2026-06-21'); // Sunday
  });

  it('supports Saturday-Friday', () => {
    const { start, end } = getWeekRange(new Date(2026, 5, 17), { ...DEFAULT_PERIOD_CONFIG, weekStart: 'saturday' });
    expect(ymd(start)).toBe('2026-06-13'); // Saturday
    expect(ymd(end)).toBe('2026-06-19'); // Friday
  });

  it('supports Sunday-Saturday', () => {
    const { start, end } = getWeekRange(new Date(2026, 5, 17), { ...DEFAULT_PERIOD_CONFIG, weekStart: 'sunday' });
    expect(ymd(start)).toBe('2026-06-14'); // Sunday
    expect(ymd(end)).toBe('2026-06-20'); // Saturday
  });
});

describe('getPeriodConfig', () => {
  it('falls back to defaults for a profile with no settings', () => {
    expect(getPeriodConfig(null)).toEqual(DEFAULT_PERIOD_CONFIG);
    expect(getPeriodConfig({})).toEqual(DEFAULT_PERIOD_CONFIG);
  });

  it('reads configured values off a profile-shaped object', () => {
    expect(
      getPeriodConfig({ moneylogYearStartMonth: 4, moneylogMonthStartDay: 15, moneylogWeekStart: 'saturday' })
    ).toEqual({ yearStartMonth: 4, monthStartDay: 15, weekStart: 'saturday' });
  });

  it('ignores an invalid weekStart value', () => {
    expect(getPeriodConfig({ moneylogWeekStart: 'tuesday' })).toEqual(DEFAULT_PERIOD_CONFIG);
  });
});
