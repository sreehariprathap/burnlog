// lib/logbook/lifeScore.ts
import type { AppId } from '@/lib/appMode';

export type LifeScoreApp = Exclude<AppId, 'logbook' | 'adminlog'>;

export const LIFE_SCORE_APPS: LifeScoreApp[] = [
  'burnlog',
  'tasklog',
  'moneylog',
  'homelog',
  'sociallog',
  'shoppinglog',
  'travellog',
  'learnlog',
];

export type LifeScoreMode = 'engagement' | 'streak' | 'goal';

export interface AppScoreDay {
  engagement: number | null; // 0 or 100 — did they touch this app today
  streakPct: number | null;  // Math.min(100, currentStreak * 10), or null if no streak concept
  goalPct: number | null;    // progress toward this app's natural goal, or null if none
}

const MODE_KEY: Record<LifeScoreMode, keyof AppScoreDay> = {
  engagement: 'engagement',
  streak: 'streakPct',
  goal: 'goalPct',
};

/**
 * Average one mode's values across enabled apps, skipping apps with no
 * value for that mode. Null if no enabled app has a value.
 */
export function averageMode(
  dayScores: Partial<Record<LifeScoreApp, AppScoreDay>>,
  mode: LifeScoreMode,
  enabledApps: LifeScoreApp[]
): number | null {
  const key = MODE_KEY[mode];
  const values = enabledApps
    .map((app) => dayScores[app]?.[key])
    .filter((v): v is number => v !== null && v !== undefined);

  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function streakToPct(currentStreak: number): number {
  return Math.min(100, currentStreak * 10);
}
