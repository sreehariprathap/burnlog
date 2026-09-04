// lib/intellog/openrouterModels.ts

export interface BrowsableOpenRouterModel {
  id: string;
  name: string;
  provider: string;
  modality: 'text' | 'vision';
  isFree: boolean;
  contextLength: number | null;
}

interface RawOpenRouterModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  architecture?: { input_modalities?: unknown } | null;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
}

function deriveProvider(id: string): string {
  const slashIndex = id.indexOf('/');
  return slashIndex === -1 ? 'unknown' : id.slice(0, slashIndex);
}

function deriveModality(model: RawOpenRouterModel): 'text' | 'vision' {
  const modalities = model.architecture?.input_modalities;
  return Array.isArray(modalities) && modalities.includes('image') ? 'vision' : 'text';
}

function deriveIsFree(id: string, model: RawOpenRouterModel): boolean {
  if (id.endsWith(':free')) return true;
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  return prompt === '0' && completion === '0';
}

/**
 * Shapes OpenRouter's `GET /api/v1/models` response ({ data: [{id, name, ...}] })
 * into the richer per-model shape AdminLog's Model Gather browser filters on.
 * Tolerant of malformed/missing fields since it's fed straight from an
 * external API response.
 */
export function mapBrowsableModels(raw: unknown): BrowsableOpenRouterModel[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { data?: unknown }).data)) {
    return [];
  }

  const models: BrowsableOpenRouterModel[] = [];
  for (const entry of (raw as { data: unknown[] }).data) {
    const model = entry as RawOpenRouterModel | null;
    const id = model?.id;
    if (typeof id !== 'string' || !id) continue;

    const rawName = model?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;
    const contextLength = typeof model?.context_length === 'number' ? model.context_length : null;

    models.push({
      id,
      name,
      provider: deriveProvider(id),
      modality: deriveModality(model as RawOpenRouterModel),
      isFree: deriveIsFree(id, model as RawOpenRouterModel),
      contextLength,
    });
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { data: BrowsableOpenRouterModel[]; fetchedAt: number } | null = null;

/**
 * Fetches the live OpenRouter model list, cached in-memory for CACHE_TTL_MS
 * so the admin browse route isn't hitting OpenRouter on every open. On a
 * failed fetch, serves the stale cache if one exists, else returns [].
 */
export async function getBrowsableModelsList(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<BrowsableOpenRouterModel[]> {
  if (cache && now() - cache.fetchedAt < CACHE_TTL_MS) {
    // Return a shallow copy, not the cached array itself — callers (e.g. the
    // Model Gather browse route) must never be able to mutate the shared
    // cache in place, which would otherwise leak across every subsequent
    // request/render until the TTL expires.
    return cache.data.slice();
  }

  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
    const json = await res.json();
    const models = mapBrowsableModels(json);
    cache = { data: models, fetchedAt: now() };
    return models;
  } catch (err) {
    if (cache) return cache.data;
    console.error('getBrowsableModelsList: fetch failed and no cache available', err);
    return [];
  }
}

/** Test-only: clears the module-level cache between test cases. */
export function __resetModelsCacheForTests(): void {
  cache = null;
}
