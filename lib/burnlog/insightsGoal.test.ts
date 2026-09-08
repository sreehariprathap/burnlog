import { describe, it, expect } from 'vitest';
import { orderMetricsByGoalFocus, goalTypeForMetric, averageValue, calculateGoalStatus } from './insightsGoal';

describe('orderMetricsByGoalFocus', () => {
  it('leads with weight for lose_weight and general_health', () => {
    expect(orderMetricsByGoalFocus('lose_weight')[0]).toBe('weight');
    expect(orderMetricsByGoalFocus('general_health')[0]).toBe('weight');
  });

  it('leads with calories for build_muscle', () => {
    expect(orderMetricsByGoalFocus('build_muscle')[0]).toBe('calories');
  });

  it('leads with stamina for improve_stamina and athletic_performance', () => {
    expect(orderMetricsByGoalFocus('improve_stamina')[0]).toBe('stamina');
    expect(orderMetricsByGoalFocus('athletic_performance')[0]).toBe('stamina');
  });

  it('falls back to the default order when goalFocus is null or undefined', () => {
    expect(orderMetricsByGoalFocus(null)).toEqual(['weight', 'calories', 'food', 'stamina']);
    expect(orderMetricsByGoalFocus(undefined)).toEqual(['weight', 'calories', 'food', 'stamina']);
  });

  it('keeps every metric exactly once, leading metric moved to front', () => {
    const result = orderMetricsByGoalFocus('build_muscle');
    expect(result).toEqual(['calories', 'weight', 'food', 'stamina']);
  });
});

describe('goalTypeForMetric', () => {
  it('maps calories to calories_burned and stamina to workout_time', () => {
    expect(goalTypeForMetric('calories')).toBe('calories_burned');
    expect(goalTypeForMetric('stamina')).toBe('workout_time');
  });

  it('returns null for weight and food (handled separately / no mapping)', () => {
    expect(goalTypeForMetric('weight')).toBeNull();
    expect(goalTypeForMetric('food')).toBeNull();
  });
});

describe('averageValue', () => {
  it('returns 0 for an empty array', () => {
    expect(averageValue([], 'duration')).toBe(0);
  });

  it('averages the given key across entries', () => {
    expect(averageValue([{ duration: 30 }, { duration: 60 }], 'duration')).toBe(45);
  });
});

describe('calculateGoalStatus', () => {
  it('reports on track within 5% of target', () => {
    expect(calculateGoalStatus(46, 45, 'min')).toContain('On track');
  });

  it('reports above target when average exceeds it by more than 5%', () => {
    expect(calculateGoalStatus(60, 45, 'min')).toContain('above your 45 min goal');
  });

  it('reports below target when average is under it by more than 5%', () => {
    expect(calculateGoalStatus(20, 45, 'min')).toContain('below your 45 min goal');
  });
});
