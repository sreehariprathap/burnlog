import { describe, it, expect } from 'vitest';
import { averageMode, type AppScoreDay, type LifeScoreApp } from './lifeScore';

const full: AppScoreDay = { engagement: 100, streakPct: 80, goalPct: 60 };
const zero: AppScoreDay = { engagement: 0, streakPct: 0, goalPct: 0 };
const empty: AppScoreDay = { engagement: null, streakPct: null, goalPct: null };

describe('averageMode', () => {
  it('averages the engagement values of enabled apps only', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full, tasklog: zero, moneylog: full };
    expect(averageMode(day, 'engagement', ['burnlog', 'tasklog'])).toBe(50);
  });

  it('excludes apps not in enabledApps even if their score exists', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full, moneylog: zero };
    expect(averageMode(day, 'engagement', ['burnlog'])).toBe(100);
  });

  it('excludes apps with a null value for the requested mode', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full, sociallog: empty };
    expect(averageMode(day, 'goal', ['burnlog', 'sociallog'])).toBe(60);
  });

  it('returns null when no enabled app has a non-null value for the mode', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { sociallog: empty, shoppinglog: empty };
    expect(averageMode(day, 'streak', ['sociallog', 'shoppinglog'])).toBeNull();
  });

  it('returns null when enabledApps is empty', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full };
    expect(averageMode(day, 'engagement', [])).toBeNull();
  });

  it('rounds the average to the nearest integer', () => {
    const a: AppScoreDay = { engagement: 100, streakPct: null, goalPct: null };
    const b: AppScoreDay = { engagement: 0, streakPct: null, goalPct: null };
    const c: AppScoreDay = { engagement: 34, streakPct: null, goalPct: null };
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: a, tasklog: b, moneylog: c };
    expect(averageMode(day, 'engagement', ['burnlog', 'tasklog', 'moneylog'])).toBe(45); // (100+0+34)/3 = 44.67 -> 45
  });
});
