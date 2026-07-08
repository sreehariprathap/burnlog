// lib/ai/errors.ts

type OpenRouterErrorBody = {
  message?: string;
  metadata?: { raw?: string };
};

function extractProviderReason(error: unknown): string | undefined {
  const body = (error as { error?: OpenRouterErrorBody } | null)?.error;
  const raw = body?.metadata?.raw;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed?.message) return parsed.message;
  } catch {
    // raw wasn't JSON — use it as-is
  }
  return raw;
}

export function formatAiError(model: string, error: unknown): string {
  const providerReason = extractProviderReason(error);
  const message = providerReason ?? (error instanceof Error ? error.message : 'Unknown error');
  return `AI request failed (model: ${model}): ${message}`;
}
