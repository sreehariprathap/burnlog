import { describe, it, expect } from 'vitest';
import { seedGoalsForFocus } from './goalDefaults';

describe('seedGoalsForFocus', () => {
  it('returns calories_burned for lose_weight when absent', () => {
    expect(seedGoalsForFocus('lose_weight', [])).toEqual([{ goalType: 'calories_burned', targetValue: 900 }]);
  });

  it('filters out goal types the user already has', () => {
    expect(seedGoalsForFocus('lose_weight', ['calories_burned'])).toEqual([]);
  });

  it('returns both workout_frequency and workout_time for build_muscle', () => {
    expect(seedGoalsForFocus('build_muscle', [])).toEqual([
      { goalType: 'workout_frequency', targetValue: 4 },
      { goalType: 'workout_time', targetValue: 45 },
    ]);
  });

  it('only fills in the missing one when the user already has one of the two', () => {
    expect(seedGoalsForFocus('build_muscle', ['workout_time'])).toEqual([
      { goalType: 'workout_frequency', targetValue: 4 },
    ]);
  });

  it('returns daily_steps for general_health and improve_stamina', () => {
    expect(seedGoalsForFocus('general_health', [])).toEqual([{ goalType: 'daily_steps', targetValue: 8000 }]);
    expect(seedGoalsForFocus('improve_stamina', [])).toEqual([{ goalType: 'daily_steps', targetValue: 10000 }]);
  });

  it('returns workout_frequency and daily_steps for athletic_performance', () => {
    expect(seedGoalsForFocus('athletic_performance', [])).toEqual([
      { goalType: 'workout_frequency', targetValue: 5 },
      { goalType: 'daily_steps', targetValue: 10000 },
    ]);
  });
});
