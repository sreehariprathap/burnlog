// lib/reminders/eveningCheckin.ts
import { resolveTarget } from '@/lib/dailyTargets';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

type CheckinParams = {
  goals: Goal[];
  metrics: Metrics;
  hasWorkoutToday: boolean;
  hasAnyActivityToday: boolean;
  currentStreak: number;
};

const GOAL_CHECKS: { key: keyof Metrics; goalType: string; label: string }[] = [
  { key: 'steps', goalType: 'daily_steps', label: 'step goal' },
  { key: 'burn', goalType: 'calories_burned', label: 'calorie-burn goal' },
  { key: 'eat', goalType: 'calories_intake', label: 'calorie-intake goal' },
  { key: 'workoutMinutes', goalType: 'workout_time', label: 'workout-minutes goal' },
];

export function buildCheckinMessage(params: CheckinParams): string | null {
  const { goals, metrics, hasWorkoutToday, hasAnyActivityToday, currentStreak } = params;
  const lines: string[] = [];

  if (!hasWorkoutToday) {
    lines.push('No workout logged yet today');
  }

  for (const check of GOAL_CHECKS) {
    // Already covered by the "no workout" line above — avoid a redundant
    // "0% of your workout-minutes goal" line on the same notification.
    if (check.key === 'workoutMinutes' && !hasWorkoutToday) continue;

    const target = resolveTarget(goals, check.goalType);
    const value = metrics[check.key];
    if (target > 0 && value / target < 0.5) {
      const pct = Math.round((value / target) * 100);
      lines.push(`${pct}% of your ${check.label}`);
    }
  }

  if (currentStreak > 0 && !hasAnyActivityToday) {
    lines.push(`Your ${currentStreak}-day streak is at risk`);
  }

  if (lines.length === 0) return null;
  return lines.join(' · ');
}
