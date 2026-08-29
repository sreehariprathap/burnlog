// app/(shoppinglog)/shoppinglog/sell/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { ListingForm, type ListingFormValues } from '../../_components/ListingForm';
import type { Category } from '../../_components/CategoryChips';

type ListingDetail = {
  id: string;
  title: string;
  description: string;
  price: number;
  condition: 'new' | 'used';
  status: string;
  stockQuantity: number;
  category: { id: string; name: string; slug: string; icon: string } | null;
  images: string[];
  isOwn: boolean;
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load listing');
  return res.json();
}

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: categoryData } = useSWR<{ categories: Category[] }>('/api/shoppinglog/categories', fetcher);
  const { data: listing, isLoading, mutate } = useSWR<ListingDetail>(`/api/shoppinglog/listings/${params.id}`, fetcher);

  const handleUpdate = async (values: ListingFormValues) => {
    const res = await apiFetch(`/api/shoppinglog/listings/${params.id}`, {
      method: 'PATCH',
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
    if (res.ok) router.push(`/shoppinglog/listing/${params.id}`);
  };

  const setStatus = async (status: 'active' | 'sold' | 'removed') => {
    const res = await apiFetch(`/api/shoppinglog/listings/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) mutate();
  };

  if (isLoading || !listing) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar title="Edit listing" />
        <main className="flex-1 p-4"><Loader2 className="h-6 w-6 animate-spin" /></main>
        <ShoppingLogBottomNav />
      </div>
    );
  }

  if (!listing.isOwn) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar title="Edit listing" />
        <main className="flex-1 p-4">
          <p className="text-sm text-muted-foreground">This isn&apos;t your listing.</p>
        </main>
        <ShoppingLogBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Edit listing" onClose={() => router.back()} />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <ListingForm
          categories={categoryData?.categories ?? []}
          initial={{
            title: listing.title,
            description: listing.description,
            price: String(listing.price),
            condition: listing.condition,
            categoryId: listing.category?.id ?? '',
            stockQuantity: String(listing.stockQuantity),
            images: listing.images,
          }}
          submitLabel="Save changes"
          onSubmit={handleUpdate}
        />
        <div className="flex gap-2">
          {listing.status !== 'removed' ? (
            <Button variant="outline" className="flex-1" onClick={() => setStatus('removed')}>
              Remove listing
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={() => setStatus('active')}>
              Relist
            </Button>
          )}
          {listing.status === 'active' && (
            <Button variant="outline" className="flex-1" onClick={() => setStatus('sold')}>
              Mark as sold
            </Button>
          )}
        </div>
      </main>
      <ShoppingLogBottomNav />
    </div>
  );
}
