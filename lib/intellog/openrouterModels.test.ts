import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapBrowsableModels, getBrowsableModelsList, __resetModelsCacheForTests } from './openrouterModels';

function rawModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o-mini',
    context_length: 128000,
    architecture: { input_modalities: ['text'] },
    pricing: { prompt: '0.00000015', completion: '0.0000006' },
    ...overrides,
  };
}

describe('mapBrowsableModels', () => {
  it('maps id/name/provider/modality/isFree/contextLength from the OpenRouter shape', () => {
    const raw = { data: [rawModel()] };
    expect(mapBrowsableModels(raw)).toEqual([
      {
        id: 'openai/gpt-4o-mini',
        name: 'OpenAI: GPT-4o-mini',
        provider: 'openai',
        modality: 'text',
        isFree: false,
        contextLength: 128000,
      },
    ]);
  });

  it('sorts alphabetically by name', () => {
    const raw = { data: [rawModel({ id: 'z/z', name: 'Zeta' }), rawModel({ id: 'a/a', name: 'Alpha' })] };
    expect(mapBrowsableModels(raw).map((m) => m.id)).toEqual(['a/a', 'z/z']);
  });

  it('falls back to id as the name when name is missing or blank', () => {
    const raw = { data: [rawModel({ name: undefined }), rawModel({ id: 'other/model', name: '  ' })] };
    expect(mapBrowsableModels(raw).map((m) => m.name)).toEqual(['openai/gpt-4o-mini', 'other/model']);
  });

  it('derives provider from the id prefix before "/", or "unknown" when there is none', () => {
    const raw = { data: [rawModel({ id: 'anthropic/claude-fable-5' }), rawModel({ id: 'no-slash-id', name: 'No Slash' })] };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'anthropic/claude-fable-5')?.provider).toBe('anthropic');
    expect(models.find((m) => m.id === 'no-slash-id')?.provider).toBe('unknown');
  });

  it('marks modality "vision" when input_modalities includes "image", else "text"', () => {
    const raw = {
      data: [
        rawModel({ id: 'a/vision', architecture: { input_modalities: ['text', 'image'] } }),
        rawModel({ id: 'a/text', architecture: { input_modalities: ['text'] } }),
        rawModel({ id: 'a/no-arch', architecture: undefined }),
      ],
    };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'a/vision')?.modality).toBe('vision');
    expect(models.find((m) => m.id === 'a/text')?.modality).toBe('text');
    expect(models.find((m) => m.id === 'a/no-arch')?.modality).toBe('text');
  });

  it('marks isFree true when the id ends with ":free" or pricing is all zero', () => {
    const raw = {
      data: [
        rawModel({ id: 'a/free-suffix:free', pricing: { prompt: '0.001', completion: '0.001' } }),
        rawModel({ id: 'a/zero-pricing', pricing: { prompt: '0', completion: '0' } }),
        rawModel({ id: 'a/paid', pricing: { prompt: '0.001', completion: '0.001' } }),
      ],
    };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'a/free-suffix:free')?.isFree).toBe(true);
    expect(models.find((m) => m.id === 'a/zero-pricing')?.isFree).toBe(true);
    expect(models.find((m) => m.id === 'a/paid')?.isFree).toBe(false);
  });

  it('uses context_length when present, else null', () => {
    const raw = { data: [rawModel({ context_length: 32000 }), rawModel({ id: 'a/none', context_length: undefined })] };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'openai/gpt-4o-mini')?.contextLength).toBe(32000);
    expect(models.find((m) => m.id === 'a/none')?.contextLength).toBeNull();
  });

  it('skips entries with no string id and returns [] for malformed input', () => {
    expect(mapBrowsableModels({ data: [{ name: 'no id' }, null, 42] })).toEqual([]);
    expect(mapBrowsableModels(null)).toEqual([]);
    expect(mapBrowsableModels({})).toEqual([]);
    expect(mapBrowsableModels({ data: 'not an array' })).toEqual([]);
  });
});

describe('getBrowsableModelsList', () => {
  beforeEach(() => {
    __resetModelsCacheForTests();
  });

  it('fetches and returns the mapped list on first call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [rawModel()] }) });
    const result = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    expect(result).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
  });

  it('serves from cache within the TTL without re-fetching', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [rawModel()] }) });
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 1000 + 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL (1 hour) has elapsed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [rawModel()] }) });
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stale cache when a re-fetch fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [rawModel()] }) })
      .mockRejectedValueOnce(new Error('network down'));
    const first = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    const second = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(second).toEqual(first);
  });

  it('returns [] when the first-ever fetch fails (no cache to fall back to)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    expect(result).toEqual([]);
  });
});
