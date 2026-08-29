// app/(shoppinglog)/shoppinglog/favorites/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { apiFetch } from '@/lib/apiFetch';
import { ListingCard, type ListingSummary } from '../_components/ListingCard';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load favorites');
  return res.json();
}

export default function FavoritesPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ favorites: ListingSummary[] }>('/api/shoppinglog/favorites', fetcher);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Favorites" onClose={() => router.back()} />
      <main className="flex-1 container mx-auto max-w-4xl space-y-4 p-4 pb-24">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (data?.favorites.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No saved listings yet.</p>
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
