// lib/shoppinglog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// Every fetcher here calls apiFetch (lib/apiFetch.ts), which transitively
// imports components/ui/use-toast.tsx for its error-toast side effect — a
// real .tsx file this repo's Vitest setup has never needed to transform.
// Mocking the module before `./queries` imports it keeps that file out of
// the test's module graph entirely (same fix as the MoneyLog/TravelLog
// registry tests).
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const { fetchCategories, fetchStats, fetchMyListings, fetchCart, categoriesQuery, statsQuery, myListingsQuery, cartQuery } =
  await import('./queries');

describe('fetchCategories', () => {
  it('returns the parsed categories payload on success', async () => {
    const payload = { categories: [{ id: 'c1', name: 'Electronics', slug: 'electronics', icon: 'Smartphone' }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchCategories();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchCategories()).rejects.toThrow('Failed to load');
  });
});

describe('fetchStats', () => {
  it('returns the parsed stats payload on success', async () => {
    const payload = { activeListings: 3, ordersThisMonth: 1 };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchStats();
    expect(result).toEqual(payload);
  });
});

describe('fetchMyListings', () => {
  it('returns the seller\'s own listings', async () => {
    const payload = { listings: [{ id: 'l1', title: 'Road Bike', price: 450 }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchMyListings();
    expect(result).toEqual(payload);
  });
});

describe('fetchCart', () => {
  it('returns the cart items on success', async () => {
    const payload = { items: [{ cartItemId: 'ci1', quantity: 2, listing: { id: 'l1', title: 'Road Bike', price: 450, stockQuantity: 1, status: 'active', seller: null, coverImageUrl: null } }] };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const result = await fetchCart();
    expect(result).toEqual(payload);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchCart()).rejects.toThrow('Failed to load cart');
  });
});

describe('registry key shapes', () => {
  it('categoriesQuery keys by the API route path', () => {
    expect(categoriesQuery().key).toBe('/api/shoppinglog/categories');
  });

  it('statsQuery keys by the API route path', () => {
    expect(statsQuery().key).toBe('/api/shoppinglog/stats');
  });

  it('myListingsQuery keys by the API route path with the mine=1 query param', () => {
    expect(myListingsQuery().key).toBe('/api/shoppinglog/listings?mine=1');
  });

  it('cartQuery keys by the API route path', () => {
    expect(cartQuery().key).toBe('/api/shoppinglog/cart');
  });
});
