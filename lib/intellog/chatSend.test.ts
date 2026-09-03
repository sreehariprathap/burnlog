import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, parseSuggestions } from './chatSend';
import type { ProfileAppContext } from './chatContext';

describe('buildSystemPrompt', () => {
  it('returns a generic no-history prompt when there are no app contexts', () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain('LogBook');
    expect(prompt).toMatch(/no\s+activity history yet/);
  });

  it('includes each app, its metrics, and cohort percentiles when present', () => {
    const contexts: ProfileAppContext[] = [
      {
        app: 'burnlog',
        metrics: { workoutsThisWeek: 3, caloriesBurned: 1200 },
        cohort: { workoutsThisWeek: { p25: 1, p50: 2, p75: 4 } },
      },
    ];
    const prompt = buildSystemPrompt(contexts);
    expect(prompt).toContain('burnlog:');
    expect(prompt).toContain('workoutsThisWeek: 3 (peers: p25=1, p50=2, p75=4)');
    expect(prompt).toContain('caloriesBurned: 1200');
  });

  it('omits the cohort suffix for metrics with no matching cohort stat', () => {
    const contexts: ProfileAppContext[] = [{ app: 'tasklog', metrics: { tasksCompleted: 5 }, cohort: {} }];
    const prompt = buildSystemPrompt(contexts);
    expect(prompt).toContain('tasksCompleted: 5');
    expect(prompt).not.toContain('tasksCompleted: 5 (peers');
  });

  it('instructs the model to be concise, ask clarifying questions, and use the Suggestions: convention', () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt.toLowerCase()).toContain('concise');
    expect(prompt.toLowerCase()).toContain('clarifying question');
    expect(prompt).toContain('Suggestions:');
  });
});

describe('parseSuggestions', () => {
  it('extracts suggestions from a trailing "Suggestions:" line and strips it from the reply', () => {
    const raw = 'Your streak is 5 days.\n\nSuggestions: How long was my last streak? | What broke my last streak?';
    const result = parseSuggestions(raw);
    expect(result.reply).toBe('Your streak is 5 days.');
    expect(result.suggestions).toEqual(['How long was my last streak?', 'What broke my last streak?']);
  });

  it('returns the trimmed reply with no suggestions when the line is absent', () => {
    const raw = '  Your streak is 5 days.  ';
    const result = parseSuggestions(raw);
    expect(result.reply).toBe('Your streak is 5 days.');
    expect(result.suggestions).toEqual([]);
  });

  it('is case-insensitive and tolerates extra whitespace around separators', () => {
    const raw = 'Sure thing.\nsuggestions:   Option A   |Option B|  Option C  ';
    const result = parseSuggestions(raw);
    expect(result.reply).toBe('Sure thing.');
    expect(result.suggestions).toEqual(['Option A', 'Option B', 'Option C']);
  });

  it('drops empty entries from stray separators', () => {
    const raw = 'Reply text.\nSuggestions: One | | Two |';
    const result = parseSuggestions(raw);
    expect(result.suggestions).toEqual(['One', 'Two']);
  });

  it('caps suggestions at 4 entries', () => {
    const raw = 'Reply text.\nSuggestions: A | B | C | D | E | F';
    const result = parseSuggestions(raw);
    expect(result.suggestions).toEqual(['A', 'B', 'C', 'D']);
  });

  it('treats a suggestions line with no usable entries as no suggestions', () => {
    const raw = 'Reply text.\nSuggestions:   |  ';
    const result = parseSuggestions(raw);
    expect(result.reply).toBe('Reply text.');
    expect(result.suggestions).toEqual([]);
  });
});
