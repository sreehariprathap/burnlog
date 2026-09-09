// lib/burnlog/goalDefaults.ts
//
// Seeds sensible fitness_goals numeric targets when a user sets/changes
// their primary goalFocus, so dashboard rings and benchmarks have a
// target without the user re-entering one. Never overwrites a goalType
// the user already has a value for — see seedGoalsForFocus's filter.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalFocus } from '@/lib/ai/types';
import type { FitnessGoal } from '@/lib/burnlog/queries';

type SeedGoal = { goalType: string; targetValue: number };

const GOAL_FOCUS_SEED_GOALS: Record<GoalFocus, SeedGoal[]> = {
  lose_weight: [{ goalType: 'calories_burned', targetValue: 900 }],
  build_muscle: [
    { goalType: 'workout_frequency', targetValue: 4 },
    { goalType: 'workout_time', targetValue: 45 },
  ],
  improve_stamina: [{ goalType: 'daily_steps', targetValue: 10000 }],
  general_health: [{ goalType: 'daily_steps', targetValue: 8000 }],
  athletic_performance: [
    { goalType: 'workout_frequency', targetValue: 5 },
    { goalType: 'daily_steps', targetValue: 10000 },
  ],
};

/** Pure: which of goalFocus's default targets the user doesn't already have a fitness_goals row for. */
export function seedGoalsForFocus(goalFocus: GoalFocus, existingGoalTypes: string[]): SeedGoal[] {
  const candidates = GOAL_FOCUS_SEED_GOALS[goalFocus] ?? [];
  return candidates.filter((c) => !existingGoalTypes.includes(c.goalType));
}

/** Inserts only the missing default goals for goalFocus and returns the inserted rows (empty array if none were missing). Throws on a Supabase error. */
export async function seedMissingFitnessGoals(
  supabase: SupabaseClient,
  profileId: string,
  goalFocus: GoalFocus,
  existingGoalTypes: string[]
): Promise<FitnessGoal[]> {
  const toSeed = seedGoalsForFocus(goalFocus, existingGoalTypes);
  if (toSeed.length === 0) return [];
  const rows = toSeed.map((g) => ({ profileId, goalType: g.goalType, targetValue: g.targetValue }));
  const { data, error } = await supabase.from('fitness_goals').insert(rows).select();
  if (error) throw error;
  return (data as FitnessGoal[]) ?? [];
}
