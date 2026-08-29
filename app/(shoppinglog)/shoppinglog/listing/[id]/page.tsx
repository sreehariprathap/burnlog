// app/(shoppinglog)/shoppinglog/listing/[id]/page.tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { formatDistanceToNowStrict } from 'date-fns';
import { Heart, Star, ShoppingCart, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/utils';

type ListingDetail = {
  id: string;
  title: string;
  description: string;
  price: number;
  condition: string;
  status: string;
  stockQuantity: number;
  createdAt: string;
  category: { id: string; name: string; slug: string; icon: string } | null;
  seller: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
  images: string[];
  reviews: { id: string; rating: number; body: string | null; createdAt: string; reviewer: { id: string; username: string; firstName: string; avatarUrl: string | null } | null }[];
  avgRating: number | null;
  reviewCount: number;
  isFavorited: boolean;
  isOwn: boolean;
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load listing');
  return res.json();
}

export default function ListingDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: listing, isLoading, mutate } = useSWR<ListingDetail>(`/api/shoppinglog/listings/${params.id}`, fetcher);

  const [imageIndex, setImageIndex] = useState(0);
  const [favBusy, setFavBusy] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  if (isLoading || !listing) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar title="Listing" />
        <main className="flex-1 p-4">
          <Loader2 className="h-6 w-6 animate-spin" />
        </main>
        <ShoppingLogBottomNav />
      </div>
    );
  }

  const toggleFavorite = async () => {
    setFavBusy(true);
    if (listing.isFavorited) {
      await apiFetch(`/api/shoppinglog/favorites/${listing.id}`, { method: 'DELETE' });
    } else {
      await apiFetch('/api/shoppinglog/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
    }
    await mutate();
    setFavBusy(false);
  };

  const addToCart = async () => {
    setAddingToCart(true);
    const res = await apiFetch('/api/shoppinglog/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id, quantity: 1 }),
    });
    if (res.ok) router.push('/shoppinglog/cart');
    setAddingToCart(false);
  };

  const submitReview = async () => {
    setSubmittingReview(true);
    const res = await apiFetch(`/api/shoppinglog/listings/${listing.id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: reviewRating, body: reviewBody.trim() || undefined }),
    });
    if (res.ok) {
      setReviewBody('');
      await mutate();
    }
    setSubmittingReview(false);
  };

  const alreadyReviewed = listing.reviews.some((r) => r.reviewer);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title={listing.title}
        onClose={() => router.back()}
        actions={
          !listing.isOwn && (
            <Button variant="ghost" size="icon" onClick={toggleFavorite} disabled={favBusy} aria-label="Favorite">
              <Heart className={cn('size-5', listing.isFavorited && 'fill-current text-primary')} />
            </Button>
          )
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <div className="aspect-square overflow-hidden rounded-lg bg-muted">
          {listing.images.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.images[imageIndex]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No photos</div>
          )}
        </div>
        {listing.images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {listing.images.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setImageIndex(i)}
                className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-md border-2', i === imageIndex ? 'border-primary' : 'border-transparent')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">${listing.price.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">
              {listing.condition === 'new' ? 'New' : 'Used'} · {listing.category?.name}
            </p>
          </div>
          {listing.avgRating !== null && (
            <span className="flex items-center gap-1 text-sm">
              <Star className="size-4 fill-current text-amber-500" />
              {listing.avgRating.toFixed(1)} ({listing.reviewCount})
            </span>
          )}
        </div>

        <p className="whitespace-pre-wrap text-sm">{listing.description}</p>

        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Avatar>
              {listing.seller?.avatarUrl && <AvatarImage src={listing.seller.avatarUrl} alt={listing.seller.username} />}
              <AvatarFallback>{listing.seller?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">@{listing.seller?.username}</p>
              <p className="text-xs text-muted-foreground">Seller</p>
            </div>
          </CardContent>
        </Card>

        {listing.status !== 'active' ? (
          <Button disabled className="w-full">
            {listing.status === 'sold' ? 'Sold out' : 'No longer available'}
          </Button>
        ) : listing.isOwn ? (
          <Button variant="outline" className="w-full" onClick={() => router.push(`/shoppinglog/sell/${listing.id}`)}>
            Edit your listing
          </Button>
        ) : (
          <Button className="w-full" onClick={addToCart} disabled={addingToCart}>
            <ShoppingCart className="mr-2 size-4" />
            {addingToCart ? 'Adding…' : 'Add to cart'}
          </Button>
        )}

        <div className="space-y-3 border-t pt-4">
          <h2 className="text-sm font-semibold">Reviews ({listing.reviewCount})</h2>
          {listing.reviews.map((r) => (
            <div key={r.id} className="flex gap-2">
              <Avatar className="size-7">
                {r.reviewer?.avatarUrl && <AvatarImage src={r.reviewer.avatarUrl} alt={r.reviewer.username} />}
                <AvatarFallback className="text-[10px]">{r.reviewer?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-lg bg-muted px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">@{r.reviewer?.username}</span>
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Star className="size-3 fill-current text-amber-500" />
                    {r.rating}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {r.body && <p className="text-sm">{r.body}</p>}
              </div>
            </div>
          ))}
          {!listing.isOwn && !alreadyReviewed && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Only buyers who purchased this item can leave a review.
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setReviewRating(n)} aria-label={`${n} stars`}>
                    <Star className={cn('size-5', n <= reviewRating ? 'fill-current text-amber-500' : 'text-muted-foreground')} />
                  </button>
                ))}
              </div>
              <Textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="Optional review text" />
              <Button size="sm" onClick={submitReview} disabled={submittingReview}>
                Submit review
              </Button>
            </div>
          )}
        </div>
      </main>
      <ShoppingLogBottomNav />
    </div>
  );
}
