// lib/shoppinglog/queries.ts
//
// Single source of truth for ShoppingLog's preloadable page queries — same
// pattern as the six prior registries. `categoriesQuery` in particular
// replaces a fetcher that was copy-pasted verbatim into both page.tsx
// (Browse) and sell/page.tsx before this file existed — same key in both
// (so no double-fetch bug), but the same query logic duplicated across two
// files instead of shared.
import { apiFetch } from '@/lib/apiFetch';
import type { Category } from '@/app/(shoppinglog)/shoppinglog/_components/CategoryChips';
import type { ListingSummary } from '@/app/(shoppinglog)/shoppinglog/_components/ListingCard';

export async function fetchCategories(): Promise<{ categories: Category[] }> {
  const res = await apiFetch('/api/shoppinglog/categories');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function categoriesQuery() {
  return {
    key: '/api/shoppinglog/categories',
    fetcher: fetchCategories,
  };
}

export async function fetchStats(): Promise<{ activeListings: number; ordersThisMonth: number }> {
  const res = await apiFetch('/api/shoppinglog/stats');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function statsQuery() {
  return {
    key: '/api/shoppinglog/stats',
    fetcher: fetchStats,
  };
}

export async function fetchMyListings(): Promise<{ listings: ListingSummary[] }> {
  const res = await apiFetch('/api/shoppinglog/listings?mine=1');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function myListingsQuery() {
  return {
    key: '/api/shoppinglog/listings?mine=1',
    fetcher: fetchMyListings,
  };
}

export type CartItem = {
  cartItemId: string;
  quantity: number;
  listing: {
    id: string;
    title: string;
    price: number;
    stockQuantity: number;
    status: string;
    seller: { id: string; username: string } | null;
    coverImageUrl: string | null;
  };
};

export async function fetchCart(): Promise<{ items: CartItem[] }> {
  const res = await apiFetch('/api/shoppinglog/cart');
  if (!res.ok) throw new Error('Failed to load cart');
  return res.json();
}

export function cartQuery() {
  return {
    key: '/api/shoppinglog/cart',
    fetcher: fetchCart,
  };
}
