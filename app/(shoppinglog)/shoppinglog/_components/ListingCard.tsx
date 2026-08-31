// app/(shoppinglog)/shoppinglog/_components/ListingCard.tsx
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

export type ListingSummary = {
  id: string;
  title: string;
  price: number;
  condition: string;
  status?: string;
  coverImageUrl: string | null;
  seller: { id: string; username: string } | null;
  avgRating?: number | null;
  reviewCount?: number;
};

export function ListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <Link href={`/shoppinglog/listing/${listing.id}`}>
      <Card className="overflow-hidden py-0">
        <div className="relative aspect-square bg-muted">
          {listing.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.coverImageUrl} alt={listing.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
          <span
            className={cn(
              'absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
              listing.condition === 'new' ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-foreground'
            )}
          >
            {listing.condition === 'new' ? 'New' : 'Used'}
          </span>
          {listing.status && listing.status !== 'active' && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
              {listing.status === 'sold' ? 'Sold' : 'Removed'}
            </span>
          )}
        </div>
        <CardContent className="space-y-1 p-3">
          <p className="line-clamp-1 text-sm font-medium">{listing.title}</p>
          <p className="text-base font-semibold">{formatCurrency(listing.price)}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">@{listing.seller?.username ?? 'unknown'}</span>
            {typeof listing.avgRating === 'number' && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Star className="size-3 fill-current text-amber-500" />
                {listing.avgRating.toFixed(1)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
