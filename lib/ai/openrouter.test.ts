import { describe, it, expect, vi } from 'vitest';
import type { LifestyleAnswers } from './types';

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
  },
}));

const { buildPrompt } = await import('./openrouter');

const profile = { age: 30, weight: 70, height: 175, activityLevel: 'moderate' };

const lifestyle: LifestyleAnswers = {
  jobType: 'desk',
  hoursSitting: '8+',
  commuteActivity: 'sedentary',
  exerciseFrequency: '3-4',
  goalFocus: 'general_health',
  injuries: '',
  preferredTrainingDays: 4,
};

describe('buildPrompt', () => {
  it('is unchanged when customInstructions is omitted', () => {
    const prompt = buildPrompt(profile, lifestyle);
    expect(prompt).not.toContain('Additional instructions from the user');
  });

  it('is unchanged when customInstructions is an empty string', () => {
    const withEmpty = buildPrompt(profile, lifestyle, '');
    const withoutArg = buildPrompt(profile, lifestyle);
    expect(withEmpty).toBe(withoutArg);
  });

  it('appends the custom instructions as a directive block when present', () => {
    const prompt = buildPrompt(profile, lifestyle, 'Keep sessions under 30 minutes');
    expect(prompt).toContain(
      'Additional instructions from the user (these are hard constraints — they take priority over the general guidance above whenever they conflict): Keep sessions under 30 minutes'
    );
  });
});
