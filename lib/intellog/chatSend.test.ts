import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './chatSend';
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
});
