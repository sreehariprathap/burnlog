// lib/ai/intelSuggestions.ts
import { client } from './openrouter';

export type SuggestionInput = {
  app: string;
  kind: string;
  metrics: Record<string, number>;
  cohort: Record<string, { p25: number; p50: number; p75: number }>;
};

export type IntelSuggestionResult = {
  app: string;
  kind: string;
  title: string;
  body: string;
  deepLink: string;
};

function buildPrompt(input: SuggestionInput[]): string {
  const context = input
    .map((entry) => {
      const metricsLines = Object.entries(entry.metrics)
        .map(([metric, value]) => {
          const cohort = entry.cohort[metric];
          const cohortText = cohort
            ? ` (cohort p25=${cohort.p25}, p50=${cohort.p50}, p75=${cohort.p75})`
            : ' (no cohort data yet)';
          return `  - ${metric}: ${value}${cohortText}`;
        })
        .join('\n');
      return `${entry.app} (${entry.kind}):\n${metricsLines}`;
    })
    .join('\n\n');

  return `You are a cross-app life assistant. Based on this user's own recent activity metrics and
anonymized cohort benchmarks (never another individual's data — only aggregate percentiles),
suggest up to 3 short, specific, actionable next steps.

${context}

Respond with ONLY a JSON object of this exact shape, no other text, no markdown code fences:
{"suggestions":[{"app":"burnlog","kind":"workout","title":"...","body":"...","deepLink":"/burnlog/dashboard"}]}`;
}

function validateSuggestions(raw: unknown): IntelSuggestionResult[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { suggestions?: unknown }).suggestions)) {
    throw new Error('AI response missing a "suggestions" array');
  }
  const suggestions = (raw as { suggestions: unknown[] }).suggestions;

  return suggestions.map((entry) => {
    const s = entry as Partial<IntelSuggestionResult> | null;
    if (
      !s ||
      typeof s.app !== 'string' ||
      typeof s.kind !== 'string' ||
      typeof s.title !== 'string' ||
      typeof s.body !== 'string' ||
      typeof s.deepLink !== 'string'
    ) {
      throw new Error('AI response contains a malformed suggestion entry');
    }
    return { app: s.app, kind: s.kind, title: s.title, body: s.body, deepLink: s.deepLink };
  });
}

export async function generateIntelSuggestions(
  input: SuggestionInput[],
  model: string
): Promise<IntelSuggestionResult[]> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [{ role: 'user', content: buildPrompt(input) }],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI response had no content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI response was not valid JSON');
  }

  return validateSuggestions(parsed);
}
