// lib/dailyTargets.ts

export const DEFAULT_TARGETS: Record<string, number> = {
  calories_burned: 900,
  calories_intake: 1800,
  workout_time: 30,
  daily_steps: 8000,
};

export function resolveTarget(
  goals: { goalType: string; targetValue: number }[],
  goalType: string
): number {
  const goal = goals.find((g) => g.goalType === goalType);
  const value = goal ? Number(goal.targetValue) : undefined;
  return value && value > 0 ? value : DEFAULT_TARGETS[goalType];
}

export function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
