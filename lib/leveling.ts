// lib/leveling.ts

/** Every 100 xp = one level. Kept separate from the schema so the curve
 * can be retuned later without a migration. */
export function computeLevel(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

/** xp awarded for a single completed workout, given the streak length
 * that completion produces. A 20xp bonus lands every 7th consecutive day. */
export function xpForCompletion(newStreak: number): number {
  const base = 10;
  const milestoneBonus = newStreak > 0 && newStreak % 7 === 0 ? 20 : 0;
  return base + milestoneBonus;
}

type StreakUpdateParams = {
  /** ISO date string (YYYY-MM-DD) of the profile's last completed session, or null if none yet. */
  lastSessionDate: string | null;
  /** ISO date string (YYYY-MM-DD) of today's completion. */
  today: string;
  currentStreak: number;
};

type StreakUpdateResult = {
  newStreak: number;
  /** 0 when the completion is a same-day repeat (no farming via multiple logs/day). */
  xpGained: number;
};

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

export function computeStreakUpdate({
  lastSessionDate,
  today,
  currentStreak,
}: StreakUpdateParams): StreakUpdateResult {
  if (lastSessionDate === null) {
    return { newStreak: 1, xpGained: xpForCompletion(1) };
  }

  const diff = daysBetween(lastSessionDate, today);

  if (diff === 0) {
    return { newStreak: currentStreak, xpGained: 0 };
  }
  if (diff === 1) {
    const newStreak = currentStreak + 1;
    return { newStreak, xpGained: xpForCompletion(newStreak) };
  }
  // diff > 1 (or negative, e.g. clock skew) - streak restarts at 1.
  return { newStreak: 1, xpGained: xpForCompletion(1) };
}
