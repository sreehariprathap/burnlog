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

describe('buildPrompt — fitness level', () => {
  it('defaults to Intermediate when fitnessLevel is omitted', () => {
    const prompt = buildPrompt(profile, lifestyle);
    expect(prompt).toContain('Fitness level: Intermediate');
  });

  it('includes beginner guidance when fitnessLevel is beginner', () => {
    const prompt = buildPrompt(profile, { ...lifestyle, fitnessLevel: 'beginner' });
    expect(prompt).toContain('Fitness level: Beginner');
    expect(prompt).toContain('favor Full Body days over isolated splits even when the user trains at a gym');
  });

  it('includes advanced guidance when fitnessLevel is advanced', () => {
    const prompt = buildPrompt(profile, { ...lifestyle, fitnessLevel: 'advanced' });
    expect(prompt).toContain('gym-accessible split-style training (Push/Pull/Legs) is fully appropriate');
  });
});

describe('buildPrompt — goal focus guidance', () => {
  it('tells the model to prefer real splits for build_muscle at a gym', () => {
    const gymLifestyle: LifestyleAnswers = {
      ...lifestyle,
      goalFocus: 'build_muscle',
      equipment: { trainingLocation: 'commercial_gym', availableEquipment: ['Barbell', 'Dumbbells'] },
    };
    const prompt = buildPrompt(profile, gymLifestyle);
    expect(prompt).toContain('prefer true Push/Pull/Legs-style splits over generic Full Body days');
  });

  it('biases toward cardio for improve_stamina', () => {
    const prompt = buildPrompt(profile, { ...lifestyle, goalFocus: 'improve_stamina' });
    expect(prompt).toContain('bias the weekly schedule toward Cardio, Outdoor Cardio, and Full Body days');
  });
});
