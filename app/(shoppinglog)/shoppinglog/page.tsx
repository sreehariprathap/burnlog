'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';
import { BrowseContent } from './_components/BrowseContent';

const SellContent = dynamic(() => import('./sell/_components/SellContent').then((m) => m.SellContent), {
  loading: () => <TabLoading />,
});
const CartContent = dynamic(() => import('./cart/_components/CartContent').then((m) => m.CartContent), {
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

/**
 * /shoppinglog is a single page for all three of its nav tabs (Browse,
 * Sell, Cart) — see ShoppingLogBottomNav, which switches between them via
 * `?tab=` instead of navigating. /shoppinglog/sell/[id] (an existing
 * listing's own edit page) stays a real, separate route — only the
 * create-listing view merged in.
 */
export default function ShoppingLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <ShoppingLogTabSwitcher />
    </Suspense>
  );
}

function ShoppingLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'browse';

  return (
    <>
      {tab === 'sell' ? (
        <SellContent />
      ) : tab === 'cart' ? (
        <CartContent />
      ) : (
        <BrowseContent />
      )}
      <ShoppingLogBottomNav />
    </>
  );
}
