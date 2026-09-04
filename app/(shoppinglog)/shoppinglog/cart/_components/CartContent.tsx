'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, Trash2, ShoppingBag, RefreshCw, ShoppingCart } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';
import { usePayment } from '@/lib/moneylog/paymentContext';
import { cartQuery, type CartItem } from '@/lib/shoppinglog/queries';

export function CartContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: CartItem[] }>(cartQuery().key, cartQuery().fetcher);
  const [checkingOut, setCheckingOut] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const remove = async (listingId: string) => {
    if (!window.confirm('Remove this item from your cart?')) return;
    setRemovingId(listingId);
    const res = await apiFetch(`/api/shoppinglog/cart/${listingId}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: 'Removed from cart' });
      mutate();
    }
    setRemovingId(null);
  };

  const items = data?.items ?? [];
  const total = items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);

  type SellerGroup = { sellerId: string; username: string; items: CartItem[] };

  const grouped = items.reduce<Record<string, SellerGroup>>((acc, item) => {
    const sellerId = item.listing.seller?.id ?? 'unknown';
    const username = item.listing.seller?.username ?? 'unknown';
    (acc[sellerId] ??= { sellerId, username, items: [] }).items.push(item);
    return acc;
  }, {});

  const { requestPayment } = usePayment();

  const checkout = async () => {
    setCheckingOut(true);
    let succeededCount = 0;
    let stoppedEarly = false;

    for (const group of Object.values(grouped)) {
      if (group.sellerId === 'unknown') {
        stoppedEarly = true;
        break;
      }

      const subtotal = group.items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);
      const memo = group.items.map((i) => i.listing.title).join(', ');

      const payment = await requestPayment({
        payeeId: group.sellerId,
        payeeLabel: `@${group.username}`,
        amount: subtotal,
        category: 'shopping',
        memo,
        sourceApp: 'shoppinglog',
      });

      if (!payment.success) {
        stoppedEarly = true;
        break;
      }

      const res = await apiFetch('/api/shoppinglog/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: group.sellerId, paymentId: payment.paymentId }),
      });

      if (!res.ok) {
        // Payment succeeded but order creation failed (e.g. cart changed
        // concurrently) — rare, and not auto-reconciled here.
        stoppedEarly = true;
        break;
      }

      succeededCount += 1;
    }

    await mutate();

    if (succeededCount > 0) {
      toast({
        title: stoppedEarly ? `${succeededCount} order(s) placed` : 'Order placed',
        description: stoppedEarly ? 'One seller could not be paid — remaining items stay in your cart.' : undefined,
      });
      router.push('/shoppinglog/orders');
    } else if (stoppedEarly) {
      toast({ variant: 'destructive', title: 'Checkout stopped', description: 'No payment went through.' });
    }

    setCheckingOut(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Cart"
        actions={
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => mutate()}>
              <RefreshCw className="size-4" />
            </Button>
            <Link href="/shoppinglog/orders">
              <Button variant="ghost" size="sm">My Orders</Button>
            </Link>
          </div>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ShoppingCart className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="text-xs text-muted-foreground">Browse listings and add something you like.</p>
            <Link href="/shoppinglog">
              <Button size="sm" className="mt-2">Browse listings</Button>
            </Link>
          </div>
        )}

        {Object.values(grouped).map((group) => (
          <div key={group.sellerId} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sold by @{group.username}</p>
            {group.items.map((item) => (
              <Card key={item.cartItemId}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.listing.coverImageUrl ? (
                      <Image src={item.listing.coverImageUrl} alt={item.listing.title} fill sizes="64px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{item.listing.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(item.listing.price)} × {item.quantity}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.listing.id)}
                    aria-label="Remove from cart"
                    disabled={removingId === item.listing.id}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </main>

      {items.length > 0 && (
        <div className="fixed bottom-20 left-1/2 z-30 w-full max-w-2xl -translate-x-1/2 px-4">
          <Card>
            <CardContent className="flex items-center justify-between p-3">
              <span className="text-sm font-semibold">Total: {formatCurrency(total)}</span>
              <Button onClick={checkout} disabled={checkingOut}>
                <ShoppingBag className="mr-2 size-4" />
                {checkingOut ? 'Processing…' : 'Checkout'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
