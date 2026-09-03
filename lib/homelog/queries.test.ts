// lib/homelog/queries.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchInvites,
  fetchChores,
  fetchBalances,
  fetchExpenses,
  fetchInventory,
  fetchShoppingList,
  invitesQuery,
  choresQuery,
  balancesQuery,
  expensesQuery,
  inventoryQuery,
  shoppingListQuery,
} from './queries';

function stubFetchOnce(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => body }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchInvites', () => {
  it('returns the pending invites', async () => {
    const invites = [{ id: 'i1', householdId: 'h1', householdName: 'The Flat', invitedByUsername: 'sam', createdAt: '2026-01-01' }];
    stubFetchOnce({ invites });
    const result = await fetchInvites();
    expect(result).toEqual(invites);
  });

  it('returns an empty array when the response has no invites field', async () => {
    stubFetchOnce({});
    const result = await fetchInvites();
    expect(result).toEqual([]);
  });
});

describe('fetchChores', () => {
  it('returns the household\'s chores', async () => {
    const chores = [{ id: 'c1', title: 'Dishes', category: 'kitchen', frequency: 'daily', autoRotate: true, instance: null }];
    stubFetchOnce({ chores });
    const result = await fetchChores();
    expect(result).toEqual(chores);
  });
});

describe('fetchBalances', () => {
  it('returns the household\'s balances', async () => {
    const balances = [{ memberA: 'p1', memberAName: 'Sam', memberB: 'p2', memberBName: 'Alex', net: 12.5 }];
    stubFetchOnce({ balances });
    const result = await fetchBalances();
    expect(result).toEqual(balances);
  });
});

describe('fetchExpenses', () => {
  it('returns the household\'s expenses', async () => {
    const expenses = [{ id: 'e1', label: 'Groceries', category: 'groceries', totalAmount: 60, paidByProfileId: 'p1', paidByName: 'Sam', date: '2026-08-01', splits: [] }];
    stubFetchOnce({ expenses });
    const result = await fetchExpenses();
    expect(result).toEqual(expenses);
  });
});

describe('fetchInventory', () => {
  it('returns the household\'s inventory items', async () => {
    const items = [{ id: 'i1', name: 'Paper towels', category: 'pantry', quantity: 2, lowStockThreshold: 1, status: 'in_stock' }];
    stubFetchOnce({ items });
    const result = await fetchInventory();
    expect(result).toEqual(items);
  });
});

describe('fetchShoppingList', () => {
  it('returns the household\'s shopping list', async () => {
    const items = [{ id: 's1', label: 'Milk', addedByName: 'Sam', inventoryItemId: null }];
    stubFetchOnce({ items });
    const result = await fetchShoppingList();
    expect(result).toEqual(items);
  });
});

describe('registry key shapes', () => {
  it('invitesQuery keys by a plain resource-name string', () => {
    expect(invitesQuery().key).toBe('homelog-invites');
  });

  it('choresQuery keys by a plain resource-name string', () => {
    expect(choresQuery().key).toBe('homelog-chores');
  });

  it('balancesQuery keys by a plain resource-name string', () => {
    expect(balancesQuery().key).toBe('homelog-balances');
  });

  it('expensesQuery keys by a plain resource-name string', () => {
    expect(expensesQuery().key).toBe('homelog-expenses');
  });

  it('inventoryQuery keys by a plain resource-name string', () => {
    expect(inventoryQuery().key).toBe('homelog-inventory');
  });

  it('shoppingListQuery keys by a plain resource-name string', () => {
    expect(shoppingListQuery().key).toBe('homelog-shopping-list');
  });
});
