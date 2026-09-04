'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Loader2, SearchX, Store, Package } from 'lucide-react';
import { RefreshCWIcon, type RefreshCCWIconWIcon } from '@/components/ui/refresh-cw';
import { HeartIcon, type HeartIconHandle } from '@/components/ui/heart';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { TopBar } from '@/components/TopBar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { apiFetch } from '@/lib/apiFetch';
import { CategoryChips, type Category } from './CategoryChips';
import { ListingCard, type ListingSummary } from './ListingCard';
import { categoriesQuery, statsQuery } from '@/lib/shoppinglog/queries';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function BrowseContent() {
  const refreshIconRef = useRef<RefreshCCWIconWIcon>(null);
  const heartIconRef = useRef<HeartIconHandle>(null);
  useMountAnimation(refreshIconRef);
  useMountAnimation(heartIconRef);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [condition, setCondition] = useState<'all' | 'new' | 'used'>('all');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const { data: categoryData } = useSWR<{ categories: Category[] }>(categoriesQuery().key, categoriesQuery().fetcher);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('q', debouncedQuery);
  if (categorySlug) params.set('categorySlug', categorySlug);
  if (condition !== 'all') params.set('condition', condition);

  const { data: listingData, isLoading, mutate } = useSWR<{ listings: ListingSummary[] }>(
    `/api/shoppinglog/listings?${params.toString()}`,
    fetcher
  );
  const { data: stats } = useSWR<{ activeListings: number; ordersThisMonth: number }>(
    statsQuery().key,
    statsQuery().fetcher
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="ShoppingLog"
        actions={
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => mutate()}>
              <RefreshCWIcon ref={refreshIconRef} size={16} />
            </Button>
            <Link href="/shoppinglog/favorites">
              <Button variant="ghost" size="icon" aria-label="Favorites">
                <HeartIcon ref={heartIconRef} size={20} />
              </Button>
            </Link>
          </div>
        }
      />
      <main className="flex-1 container mx-auto max-w-4xl space-y-4 p-4 pb-24">
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Active listings" icon={Store}>
            <p className="text-2xl font-bold">{stats?.activeListings ?? 0}</p>
          </StatCard>
          <StatCard title="Orders this month" icon={Package}>
            <p className="text-2xl font-bold">{stats?.ordersThisMonth ?? 0}</p>
          </StatCard>
        </div>
        <Label htmlFor="listing-search" className="sr-only">
          Search listings
        </Label>
        <Input
          id="listing-search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search listings…"
        />

        <CategoryChips categories={categoryData?.categories ?? []} selected={categorySlug} onSelect={setCategorySlug} />

        <div className="flex gap-2">
          {(['all', 'new', 'used'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCondition(c)}
              aria-pressed={condition === c}
              className={
                condition === c
                  ? 'rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground'
                  : 'rounded-full px-3 py-1 text-xs font-medium text-muted-foreground'
              }
            >
              {c === 'all' ? 'All conditions' : c === 'new' ? 'New' : 'Used'}
            </button>
          ))}
        </div>

        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (listingData?.listings.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No listings match yet</p>
            <p className="text-xs text-muted-foreground">Try a different search or category.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(listingData?.listings ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </main>
    </div>
  );
}
