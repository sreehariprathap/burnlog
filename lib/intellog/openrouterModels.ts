// lib/intellog/openrouterModels.ts

export interface OpenRouterModel {
  id: string;
  name: string;
}

/**
 * Shapes OpenRouter's `GET /api/v1/models` response ({ data: [{id, name, ...}] })
 * into a minimal, sorted list for the model picker. Tolerant of malformed/missing
 * fields since it's fed straight from an external API response.
 */
export function mapOpenRouterModels(raw: unknown): OpenRouterModel[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { data?: unknown }).data)) {
    return [];
  }

  const models: OpenRouterModel[] = [];
  for (const entry of (raw as { data: unknown[] }).data) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !id) continue;
    const rawName = (entry as { name?: unknown } | null)?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;
    models.push({ id, name });
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { data: OpenRouterModel[]; fetchedAt: number } | null = null;

/**
 * Fetches the live OpenRouter model list, cached in-memory for CACHE_TTL_MS
 * so the /models route isn't hitting OpenRouter on every open. On a failed
 * fetch, serves the stale cache if one exists, else returns [] — the model
 * picker's free-text custom-model input still works either way.
 */
export async function getModelsList(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<OpenRouterModel[]> {
  if (cache && now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
    const json = await res.json();
    const models = mapOpenRouterModels(json);
    cache = { data: models, fetchedAt: now() };
    return models;
  } catch (err) {
    if (cache) return cache.data;
    console.error('getModelsList: fetch failed and no cache available', err);
    return [];
  }
}

/** Test-only: clears the module-level cache between test cases. */
export function __resetModelsCacheForTests(): void {
  cache = null;
}
