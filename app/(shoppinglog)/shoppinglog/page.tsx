// app/(shoppinglog)/shoppinglog/page.tsx
'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Heart, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';
import { CategoryChips, type Category } from './_components/CategoryChips';
import { ListingCard, type ListingSummary } from './_components/ListingCard';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function ShoppingLogBrowsePage() {
  const { profile } = useCurrentProfile();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [condition, setCondition] = useState<'all' | 'new' | 'used'>('all');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const { data: categoryData } = useSWR<{ categories: Category[] }>('/api/shoppinglog/categories', fetcher);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('q', debouncedQuery);
  if (categorySlug) params.set('categorySlug', categorySlug);
  if (condition !== 'all') params.set('condition', condition);

  const { data: listingData, isLoading } = useSWR<{ listings: ListingSummary[] }>(
    `/api/shoppinglog/listings?${params.toString()}`,
    fetcher
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="ShoppingLog"
        actions={
          <Link href="/shoppinglog/favorites">
            <Button variant="ghost" size="icon" aria-label="Favorites">
              <Heart className="size-5" />
            </Button>
          </Link>
        }
      />
      {profile && <CrossAppSnapshot currentApp="shoppinglog" profileId={profile.id} />}
      <main className="flex-1 container mx-auto max-w-4xl space-y-4 p-4 pb-24">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listings…" />

        <CategoryChips categories={categoryData?.categories ?? []} selected={categorySlug} onSelect={setCategorySlug} />

        <div className="flex gap-2">
          {(['all', 'new', 'used'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCondition(c)}
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
          <p className="py-8 text-center text-sm text-muted-foreground">No listings match yet.</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(listingData?.listings ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </main>
      <ShoppingLogBottomNav />
    </div>
  );
}
