import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateIntelSuggestions, type SuggestionInput } from './intelSuggestions';
import { client } from './openrouter';

vi.mock('./openrouter', () => ({ client: { chat: { completions: { create: vi.fn() } } } }));

const sampleInput: SuggestionInput[] = [
  {
    app: 'burnlog',
    kind: 'workout',
    metrics: { workoutsPerWeek: 2 },
    cohort: { workoutsPerWeek: { p25: 2, p50: 4, p75: 6 } },
  },
];

describe('generateIntelSuggestions', () => {
  beforeEach(() => vi.mocked(client.chat.completions.create).mockReset());

  it('parses a well-formed JSON response into suggestions', async () => {
    vi.mocked(client.chat.completions.create).mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { app: 'burnlog', kind: 'workout', title: 'Add a session', body: 'You are below your cohort median.', deepLink: '/burnlog/dashboard' },
              ],
            }),
          },
        },
      ],
    } as never);

    const result = await generateIntelSuggestions(sampleInput, 'openai/gpt-oss-120b:free');
    expect(result).toEqual([
      { app: 'burnlog', kind: 'workout', title: 'Add a session', body: 'You are below your cohort median.', deepLink: '/burnlog/dashboard' },
    ]);
  });

  it('throws when the response is not valid JSON', async () => {
    vi.mocked(client.chat.completions.create).mockResolvedValue({
      choices: [{ message: { content: 'not json' } }],
    } as never);

    await expect(generateIntelSuggestions(sampleInput, 'openai/gpt-oss-120b:free')).rejects.toThrow('not valid JSON');
  });

  it('throws when a suggestion entry is missing a required field', async () => {
    vi.mocked(client.chat.completions.create).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ suggestions: [{ app: 'burnlog', kind: 'workout' }] }) } }],
    } as never);

    await expect(generateIntelSuggestions(sampleInput, 'openai/gpt-oss-120b:free')).rejects.toThrow('malformed suggestion');
  });
});
