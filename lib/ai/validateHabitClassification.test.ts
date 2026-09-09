import { describe, it, expect } from 'vitest';
import { validateHabitClassification } from './validateHabitClassification';

const APP_IDS = ['burnlog', 'travellog', 'tasklog', 'homelog'];

describe('validateHabitClassification', () => {
  it('accepts a fully-populated valid response', () => {
    const result = validateHabitClassification(
      {
        title: 'Drink water',
        sourceApp: 'burnlog',
        isRecurring: true,
        suggestedRecurrence: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalWeeks: 1 },
      },
      APP_IDS
    );
    expect(result).toEqual({
      title: 'Drink water',
      sourceApp: 'burnlog',
      isRecurring: true,
      suggestedRecurrence: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalWeeks: 1 },
    });
  });

  it('accepts sourceApp: null', () => {
    const result = validateHabitClassification({ title: 'Read a book', sourceApp: null, isRecurring: false }, APP_IDS);
    expect(result.sourceApp).toBeNull();
  });

  it('accepts a response with no suggestedRecurrence', () => {
    const result = validateHabitClassification({ title: 'Pack bags', sourceApp: 'travellog', isRecurring: false }, APP_IDS);
    expect(result.suggestedRecurrence).toBeUndefined();
  });

  it('rejects a missing title', () => {
    expect(() => validateHabitClassification({ sourceApp: null, isRecurring: false }, APP_IDS)).toThrow();
  });

  it('rejects a sourceApp not in the roster', () => {
    expect(() =>
      validateHabitClassification({ title: 'x', sourceApp: 'not-a-real-app', isRecurring: false }, APP_IDS)
    ).toThrow();
  });

  it('rejects a non-boolean isRecurring', () => {
    expect(() =>
      validateHabitClassification({ title: 'x', sourceApp: null, isRecurring: 'yes' }, APP_IDS)
    ).toThrow();
  });

  it('rejects an invalid daysOfWeek entry', () => {
    expect(() =>
      validateHabitClassification(
        { title: 'x', sourceApp: null, isRecurring: true, suggestedRecurrence: { daysOfWeek: [0, 9] } },
        APP_IDS
      )
    ).toThrow();
  });
});
