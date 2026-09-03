// lib/homelog/queries.ts
//
// Single source of truth for HomeLog's preloadable page queries — same
// pattern as the burnlog/moneylog/tasklog/travellog registries.
// `choresQuery` and `balancesQuery` in particular replace a real drift
// risk: 'homelog-chores' and 'homelog-balances' were each used as an SWR
// key by two different pages, each with its OWN locally-defined fetcher
// and its OWN (differently narrow) TypeScript type for the same JSON
// response — safe today only because both call sites happen to agree on
// what fields they read, which is exactly the kind of assumption that
// silently breaks later. Both are unified here on the fuller type.
//
// Every fetcher below calls this app's own /api/homelog/* routes with
// bare fetch() (not apiFetch) — no .tsx-import test gotcha applies here.

export type PendingInvite = {
  id: string;
  householdId: string;
  householdName: string;
  invitedByUsername: string;
  createdAt: string;
};

export async function fetchInvites(): Promise<PendingInvite[]> {
  const res = await fetch('/api/homelog/invites');
  const body = await res.json();
  return body.invites ?? [];
}

export function invitesQuery() {
  return {
    key: 'homelog-invites',
    fetcher: fetchInvites,
  };
}

export type ChoreInfo = {
  id: string;
  title: string;
  category: string;
  frequency: string;
  autoRotate: boolean;
  instance: { id: string; dueDate: string; assignedProfileId: string | null; assignedName: string | null } | null;
};

export async function fetchChores(): Promise<ChoreInfo[]> {
  const res = await fetch('/api/homelog/chores');
  const body = await res.json();
  return body.chores ?? [];
}

export function choresQuery() {
  return {
    key: 'homelog-chores',
    fetcher: fetchChores,
  };
}

export type BalanceInfo = {
  memberA: string;
  memberAName: string;
  memberB: string;
  memberBName: string;
  net: number;
};

export async function fetchBalances(): Promise<BalanceInfo[]> {
  const res = await fetch('/api/homelog/balances');
  const body = await res.json();
  return body.balances ?? [];
}

export function balancesQuery() {
  return {
    key: 'homelog-balances',
    fetcher: fetchBalances,
  };
}

export type ExpenseInfo = {
  id: string;
  label: string;
  category: string;
  totalAmount: number;
  paidByProfileId: string;
  paidByName: string;
  date: string;
  splits: { profileId: string; name: string; shareAmount: number }[];
};

export async function fetchExpenses(): Promise<ExpenseInfo[]> {
  const res = await fetch('/api/homelog/expenses');
  const body = await res.json();
  return body.expenses ?? [];
}

export function expensesQuery() {
  return {
    key: 'homelog-expenses',
    fetcher: fetchExpenses,
  };
}

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  lowStockThreshold: number;
  status: 'in_stock' | 'low' | 'out';
};

export async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch('/api/homelog/inventory');
  const body = await res.json();
  return body.items ?? [];
}

export function inventoryQuery() {
  return {
    key: 'homelog-inventory',
    fetcher: fetchInventory,
  };
}

export type ShoppingItem = {
  id: string;
  label: string;
  addedByName: string;
  inventoryItemId: string | null;
};

export async function fetchShoppingList(): Promise<ShoppingItem[]> {
  const res = await fetch('/api/homelog/shopping-list');
  const body = await res.json();
  return body.items ?? [];
}

export function shoppingListQuery() {
  return {
    key: 'homelog-shopping-list',
    fetcher: fetchShoppingList,
  };
}
