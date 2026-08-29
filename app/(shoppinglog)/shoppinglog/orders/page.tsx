// app/(shoppinglog)/shoppinglog/orders/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/apiFetch';

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
            {formatDistanceToNowStrict(new Date(order.createdAt), { addSuffix: true })}
          </span>
        </div>
        <ul className="space-y-1">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm text-muted-foreground">
              <span>{item.title} × {item.quantity}</span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t pt-2 text-sm font-semibold">
          <span>Total</span>
          <span>${order.totalAmount.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersPage() {
  const [tab, setTab] = useState<'purchases' | 'sales'>('purchases');
  const { data, isLoading } = useSWR<{ purchases: PurchaseOrder[]; sales: SaleOrder[] }>('/api/shoppinglog/orders', fetcher);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Orders" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="purchases" className="flex-1">Purchases</TabsTrigger>
            <TabsTrigger value="sales" className="flex-1">Sales</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}

        {!isLoading && tab === 'purchases' && (data?.purchases.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No purchases yet.</p>
        )}
        {!isLoading && tab === 'sales' && (data?.sales.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales yet.</p>
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
