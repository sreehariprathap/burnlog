// lib/ai/errors.ts
export function formatAiError(model: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return `AI request failed (model: ${model}): ${message}`;
}
