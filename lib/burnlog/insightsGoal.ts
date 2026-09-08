// lib/burnlog/insightsGoal.ts
//
// Pure, testable logic for making BurnLog's Insights page goal-aware:
// which metric tab leads (orderMetricsByGoalFocus) and whether the
// leading metric has a fitness_goals target to report progress against
// (goalTypeForMetric + calculateGoalStatus). Kept separate from
// InsightsClient.tsx so it's unit-testable without rendering React.
import type { GoalFocus } from '@/lib/ai/types';

export type MetricKey = 'weight' | 'calories' | 'food' | 'stamina';

export const DEFAULT_METRIC_ORDER: MetricKey[] = ['weight', 'calories', 'food', 'stamina'];

const LEADING_METRIC_BY_GOAL_FOCUS: Record<GoalFocus, MetricKey> = {
  lose_weight: 'weight',
  build_muscle: 'calories',
  improve_stamina: 'stamina',
  athletic_performance: 'stamina',
  general_health: 'weight',
};

/** Reorders the metric tabs so the one matching the user's active goalFocus leads; falls back to the default order when goalFocus is unset. */
export function orderMetricsByGoalFocus(goalFocus: GoalFocus | null | undefined): MetricKey[] {
  const leading = goalFocus ? LEADING_METRIC_BY_GOAL_FOCUS[goalFocus] : undefined;
  if (!leading) return DEFAULT_METRIC_ORDER;
  return [leading, ...DEFAULT_METRIC_ORDER.filter((m) => m !== leading)];
}

const GOAL_TYPE_BY_METRIC: Record<MetricKey, string | null> = {
  weight: null, // weight already gets its own forecast-based line against the weight_loss goal
  calories: 'calories_burned',
  food: null,
  stamina: 'workout_time',
};

/** Which fitness_goals `goalType` (if any) a metric's progress line should compare against. */
export function goalTypeForMetric(metric: MetricKey): string | null {
  return GOAL_TYPE_BY_METRIC[metric];
}

export function averageValue(chartData: Array<{ [key: string]: unknown }>, valueKey: string): number {
  if (chartData.length === 0) return 0;
  const sum = chartData.reduce((acc, d) => acc + (Number(d[valueKey]) || 0), 0);
  return sum / chartData.length;
}

/** A short "averaging X vs your Y goal" status line for a metric's leading-tab goal-progress display. */
export function calculateGoalStatus(average: number, target: number, unit: string): string {
  const diffPct = target === 0 ? 0 : ((average - target) / target) * 100;
  if (Math.abs(diffPct) < 5) {
    return `On track — averaging ${average.toFixed(0)} ${unit} vs your ${target} ${unit} goal`;
  }
  if (average > target) {
    return `Averaging ${average.toFixed(0)} ${unit}, above your ${target} ${unit} goal`;
  }
  return `Averaging ${average.toFixed(0)} ${unit}, below your ${target} ${unit} goal`;
}
