// lib/moneylog/queries.test.ts
import { describe, it, expect, vi } from 'vitest';

// apiFetch (lib/apiFetch.ts) transitively imports components/ui/use-toast.tsx
// for its error-toast side effect — a real .tsx file this repo's Vitest
// setup has never needed to transform (zero component tests exist here by
// design). Mocking the module before `./queries` imports it keeps that
// .tsx file out of the test's module graph entirely, rather than teaching
// Vitest a new capability just for this one fetcher.
const apiFetchMock = vi.fn();
vi.mock('@/lib/apiFetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const {
  fetchFinancialGoals,
  fetchRecurringItems,
  fetchAllFinanceTransactions,
  fetchAssetsSummary,
  financialGoalsQuery,
  recurringItemsQuery,
  allFinanceTransactionsQuery,
  assetsQuery,
} = await import('./queries');

// Same shape as lib/burnlog/queries.test.ts's fakeSupabase: Supabase query
// builders are thenable at every step (so a query can be awaited directly)
// while also being chainable further (a second .eq(), .order(), etc.).
function fakeSupabase(resolved: { data: unknown; error: unknown }) {
  const makeThenable = (extra: Record<string, unknown>) => ({
    then: (onFulfilled: (value: typeof resolved) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected),
    ...extra,
  });

  const order = vi.fn().mockReturnValue(makeThenable({}));
  const eqSecond = makeThenable({ order });
  const eqFirst = makeThenable({ eq: vi.fn().mockReturnValue(eqSecond), order });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqFirst) });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('fetchFinancialGoals', () => {
  it('returns the profile\'s financial goals', async () => {
    const goals = [{ id: 'g1', goalType: 'savings_target', label: 'Emergency Fund', category: null, targetValue: 5000, targetDate: null, createdAt: '2026-01-01' }];
    const supabase = fakeSupabase({ data: goals, error: null });
    const result = await fetchFinancialGoals(supabase, 'profile-1');
    expect(result).toEqual(goals);
  });

  it('throws on a Supabase error', async () => {
    const supabase = fakeSupabase({ data: null, error: new Error('boom') });
    await expect(fetchFinancialGoals(supabase, 'profile-1')).rejects.toThrow('boom');
  });
});

describe('fetchRecurringItems', () => {
  it('returns the profile\'s active recurring items', async () => {
    const items = [{ id: 'r1', type: 'expense', category: 'rent', label: 'Rent', amount: 1500, frequency: 'monthly', dayOfWeek: null, dayOfMonth: 1, monthOfYear: null, startDate: '2026-01-01', endDate: null, isActive: true, createdAt: '2026-01-01' }];
    const supabase = fakeSupabase({ data: items, error: null });
    const result = await fetchRecurringItems(supabase, 'profile-1');
    expect(result).toEqual(items);
  });

  it('returns an empty array when data is null', async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchRecurringItems(supabase, 'profile-1');
    expect(result).toEqual([]);
  });
});

describe('fetchAllFinanceTransactions', () => {
  it('returns the profile\'s full transaction history', async () => {
    const transactions = [{ type: 'expense', category: 'groceries', amount: 50, date: '2026-08-01' }];
    const supabase = fakeSupabase({ data: transactions, error: null });
    const result = await fetchAllFinanceTransactions(supabase, 'profile-1');
    expect(result).toEqual(transactions);
  });
});

describe('fetchAssetsSummary', () => {
  it('returns the parsed assets summary on success', async () => {
    const summary = { assets: [{ id: 'a1', name: 'Checking', category: 'bank', value: 1000, updatedAt: null }], netWorth: 1000 };
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => summary });
    const result = await fetchAssetsSummary();
    expect(result).toEqual(summary);
  });

  it('throws when the response is not ok', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    await expect(fetchAssetsSummary()).rejects.toThrow('Failed to load assets');
  });
});

describe('registry key shapes', () => {
  it('financialGoalsQuery keys by app+resource+profileId', () => {
    expect(financialGoalsQuery('profile-1').key).toEqual(['moneylog-financial-goals', 'profile-1']);
  });

  it('recurringItemsQuery keys by app+resource+profileId', () => {
    expect(recurringItemsQuery('profile-1').key).toEqual(['moneylog-recurring-items', 'profile-1']);
  });

  it('allFinanceTransactionsQuery keys by app+resource+profileId', () => {
    expect(allFinanceTransactionsQuery('profile-1').key).toEqual(['moneylog-all-finance-transactions', 'profile-1']);
  });

  it('assetsQuery keys by the API route path (session-scoped server-side, no profileId needed)', () => {
    expect(assetsQuery().key).toBe('/api/moneylog/assets');
  });
});
