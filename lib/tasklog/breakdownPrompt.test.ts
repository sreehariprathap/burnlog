import { describe, it, expect } from 'vitest';
import { buildBreakdownPrompt } from './breakdownPrompt';

describe('buildBreakdownPrompt', () => {
  it('is unchanged when customInstructions is omitted', () => {
    const prompt = buildBreakdownPrompt('Learn guitar', 'Practice daily', 'life');
    expect(prompt).not.toContain('Additional instructions from the user');
  });

  it('is unchanged when customInstructions is an empty string', () => {
    const withEmpty = buildBreakdownPrompt('Learn guitar', 'Practice daily', 'life', '');
    const withoutArg = buildBreakdownPrompt('Learn guitar', 'Practice daily', 'life');
    expect(withEmpty).toBe(withoutArg);
  });

  it('appends the custom instructions as a directive block when present', () => {
    const prompt = buildBreakdownPrompt('Learn guitar', 'Practice daily', 'life', 'Focus on beginner-friendly tasks only');
    expect(prompt).toContain(
      'Additional instructions from the user (follow these unless they conflict with the rules above): Focus on beginner-friendly tasks only'
    );
  });
});
