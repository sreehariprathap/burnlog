import { describe, it, expect, vi } from 'vitest';

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
  },
}));

const { buildPrompt } = await import('./route');

describe('buildPrompt', () => {
  it('is unchanged when customInstructions is omitted', () => {
    const prompt = buildPrompt('Learn guitar', 'Practice daily', 'life');
    expect(prompt).not.toContain('Additional instructions from the user');
  });

  it('is unchanged when customInstructions is an empty string', () => {
    const withEmpty = buildPrompt('Learn guitar', 'Practice daily', 'life', '');
    const withoutArg = buildPrompt('Learn guitar', 'Practice daily', 'life');
    expect(withEmpty).toBe(withoutArg);
  });

  it('appends the custom instructions as a directive block when present', () => {
    const prompt = buildPrompt('Learn guitar', 'Practice daily', 'life', 'Focus on beginner-friendly tasks only');
    expect(prompt).toContain(
      'Additional instructions from the user (follow these unless they conflict with the rules above): Focus on beginner-friendly tasks only'
    );
  });
});
