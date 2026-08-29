// app/(shoppinglog)/shoppinglog/sell/page.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, Package } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { ListingForm, type ListingFormValues } from '../_components/ListingForm';
import { ListingCard, type ListingSummary } from '../_components/ListingCard';
import type { Category } from '../_components/CategoryChips';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function SellPage() {
  const router = useRouter();
  const { data: categoryData } = useSWR<{ categories: Category[] }>('/api/shoppinglog/categories', fetcher);
  const { data: myListingsData, mutate } = useSWR<{ listings: ListingSummary[] }>('/api/shoppinglog/listings?mine=1', fetcher);

  const handleCreate = async (values: ListingFormValues) => {
    const res = await apiFetch('/api/shoppinglog/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        price: Number(values.price),
        condition: values.condition,
        categoryId: values.categoryId,
        stockQuantity: Number(values.stockQuantity) || 1,
        images: values.images,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      mutate();
      router.push(`/shoppinglog/listing/${created.id}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Sell"
        actions={
          <Link href="/shoppinglog/orders">
            <Button variant="ghost" size="sm">My Orders</Button>
          </Link>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-6 p-4 pb-24">
        <ListingForm categories={categoryData?.categories ?? []} submitLabel="List item" onSubmit={handleCreate} />

        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4" />
            Your listings
          </h2>
          {!myListingsData && <Loader2 className="h-5 w-5 animate-spin" />}
          {myListingsData && myListingsData.listings.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing listed yet.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(myListingsData?.listings ?? []).map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </main>
      <ShoppingLogBottomNav />
    </div>
  );
}
