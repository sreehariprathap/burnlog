import { describe, it, expect, vi } from 'vitest';
import type { LifestyleAnswers } from '@/lib/ai/types';

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
  },
}));

const { buildMealPlanPrompt } = await import('./route');

const lifestyle: LifestyleAnswers = {
  jobType: 'desk',
  hoursSitting: '8+',
  commuteActivity: 'sedentary',
  exerciseFrequency: '3-4',
  goalFocus: 'general_health',
  injuries: '',
  preferredTrainingDays: 4,
};

const profile = { age: 30, weight: 70 };

describe('buildMealPlanPrompt', () => {
  it('is unchanged when customInstructions is omitted', () => {
    const prompt = buildMealPlanPrompt(lifestyle, profile);
    expect(prompt).not.toContain('Additional instructions from the user');
  });

  it('is unchanged when customInstructions is an empty string', () => {
    const withEmpty = buildMealPlanPrompt(lifestyle, profile, '');
    const withoutArg = buildMealPlanPrompt(lifestyle, profile);
    expect(withEmpty).toBe(withoutArg);
  });

  it('appends the custom instructions as a directive block when present', () => {
    const prompt = buildMealPlanPrompt(lifestyle, profile, 'I am out of eggs this week');
    expect(prompt).toContain(
      'Additional instructions from the user (follow these unless they conflict with the rules above): I am out of eggs this week'
    );
  });
});
