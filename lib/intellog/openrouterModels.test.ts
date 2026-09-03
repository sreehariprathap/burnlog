import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapOpenRouterModels, getModelsList, __resetModelsCacheForTests } from './openrouterModels';

describe('mapOpenRouterModels', () => {
  it('maps id/name pairs from the OpenRouter { data: [...] } shape', () => {
    const raw = { data: [{ id: 'openai/gpt-5', name: 'GPT-5' }, { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5' }] };
    expect(mapOpenRouterModels(raw)).toEqual([
      { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5' },
      { id: 'openai/gpt-5', name: 'GPT-5' },
    ]);
  });

  it('sorts alphabetically by name', () => {
    const raw = { data: [{ id: 'z/z', name: 'Zeta' }, { id: 'a/a', name: 'Alpha' }] };
    expect(mapOpenRouterModels(raw).map((m) => m.id)).toEqual(['a/a', 'z/z']);
  });

  it('falls back to id as the name when name is missing or blank', () => {
    const raw = { data: [{ id: 'some/model' }, { id: 'other/model', name: '  ' }] };
    expect(mapOpenRouterModels(raw)).toEqual([
      { id: 'other/model', name: 'other/model' },
      { id: 'some/model', name: 'some/model' },
    ]);
  });

  it('skips entries with no string id and returns [] for malformed input', () => {
    expect(mapOpenRouterModels({ data: [{ name: 'no id' }, null, 42] })).toEqual([]);
    expect(mapOpenRouterModels(null)).toEqual([]);
    expect(mapOpenRouterModels({})).toEqual([]);
    expect(mapOpenRouterModels({ data: 'not an array' })).toEqual([]);
  });
});

describe('getModelsList', () => {
  beforeEach(() => {
    __resetModelsCacheForTests();
  });

  it('fetches and returns the mapped list on first call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }),
    });
    const result = await getModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    expect(result).toEqual([{ id: 'a/a', name: 'Alpha' }]);
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
  });

  it('serves from cache within the TTL without re-fetching', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }),
    });
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 1000 + 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL (1 hour) has elapsed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }),
    });
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stale cache when a re-fetch fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }) })
      .mockRejectedValueOnce(new Error('network down'));
    const first = await getModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    const second = await getModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(second).toEqual(first);
  });

  it('returns [] when the first-ever fetch fails (no cache to fall back to)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await getModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    expect(result).toEqual([]);
  });
});
