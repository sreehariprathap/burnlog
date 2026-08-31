// app/(shoppinglog)/shoppinglog/favorites/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { Loader2, Heart, RefreshCw } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { ListingCard, type ListingSummary } from '../_components/ListingCard';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load favorites');
  return res.json();
}

export default function FavoritesPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ favorites: ListingSummary[] }>('/api/shoppinglog/favorites', fetcher);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Favorites"
        onClose={() => router.back()}
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => mutate()}>
            <RefreshCw className="size-4" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-4xl space-y-4 p-4 pb-24">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (data?.favorites.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Heart className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No saved listings yet</p>
            <p className="text-xs text-muted-foreground">Tap the heart on a listing to save it here.</p>
            <Link href="/shoppinglog">
              <Button size="sm" className="mt-2">Browse listings</Button>
            </Link>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(data?.favorites ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </main>
      <ShoppingLogBottomNav />
    </div>
  );
}
