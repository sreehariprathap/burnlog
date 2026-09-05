// app/(shoppinglog)/shoppinglog/orders/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, RefreshCw, Package } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/apiFetch';
import { formatCurrency, formatRelative } from '@/lib/format';

type OrderItem = { id: string; title: string; price: number; quantity: number };
type Order = {
  id: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
};
type PurchaseOrder = Order & { seller: { id: string; username: string } | null };
type SaleOrder = Order & { buyer: { id: string; username: string } | null };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load orders');
  return res.json();
}

function OrderCard({ order, counterpartLabel, counterpartUsername }: { order: Order; counterpartLabel: string; counterpartUsername: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {counterpartLabel} @{counterpartUsername}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelative(order.createdAt)}
          </span>
        </div>
        <ul className="space-y-1">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm text-muted-foreground">
              <span>{item.title} × {item.quantity}</span>
              <span>{formatCurrency(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t pt-2 text-sm font-semibold">
          <span>Total</span>
          <span>{formatCurrency(order.totalAmount)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}

function OrdersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') === 'sales' ? 'sales' : 'purchases') as 'purchases' | 'sales';
  const setTab = (next: 'purchases' | 'sales') => {
    router.replace(`/shoppinglog/orders?tab=${next}`);
  };
  const { data, isLoading, mutate } = useSWR<{ purchases: PurchaseOrder[]; sales: SaleOrder[] }>('/api/shoppinglog/orders', fetcher);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Orders"
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => mutate()}>
            <RefreshCw className="size-4" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="purchases" className="flex-1">Purchases</TabsTrigger>
            <TabsTrigger value="sales" className="flex-1">Sales</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}

        {!isLoading && tab === 'purchases' && (data?.purchases.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No purchases yet</p>
            <p className="text-xs text-muted-foreground">Items you buy will show up here.</p>
          </div>
        )}
        {!isLoading && tab === 'sales' && (data?.sales.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No sales yet</p>
            <p className="text-xs text-muted-foreground">Items you sell will show up here.</p>
          </div>
        )}

        {tab === 'purchases' &&
          (data?.purchases ?? []).map((order) => (
            <OrderCard key={order.id} order={order} counterpartLabel="Bought from" counterpartUsername={order.seller?.username ?? 'unknown'} />
          ))}
        {tab === 'sales' &&
          (data?.sales ?? []).map((order) => (
            <OrderCard key={order.id} order={order} counterpartLabel="Sold to" counterpartUsername={order.buyer?.username ?? 'unknown'} />
          ))}
      </main>
      <ShoppingLogBottomNav />
    </div>
  );
}
