// components/ShoppingLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { PlusCircleIcon, ShoppingCartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { categoriesQuery, statsQuery, myListingsQuery, cartQuery } from '@/lib/shoppinglog/queries';

const tabs = [
  { tab: 'browse', href: '/shoppinglog?tab=browse', label: 'Browse', Icon: null },
  { tab: 'sell', href: '/shoppinglog?tab=sell', label: 'Sell', Icon: PlusCircleIcon },
  { tab: 'cart', href: '/shoppinglog?tab=cart', label: 'Cart', Icon: ShoppingCartIcon },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function ShoppingLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <ShoppingLogBottomNavInner />
    </Suspense>
  );
}

function ShoppingLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onShoppingLog = pathname === '/shoppinglog';
  const activeTab = searchParams.get('tab') ?? 'browse';
  const isConfigActive = pathname === '/shoppinglog/config' || pathname.startsWith('/shoppinglog/config/');
  // A listing's own edit page (/shoppinglog/sell/[id]) is a real, separate
  // route (not a tab) — still highlight Sell while viewing one, matching
  // the old pathname-based check's behavior there.
  const onSellDetail = pathname.startsWith('/shoppinglog/sell/');

  // Warms Browse's categories/stats, Sell's categories (shared)/my listings,
  // and the Cart. No useCurrentProfile() needed here — every one of this
  // app's queries is session-scoped server-side via the API route, not
  // parameterized by profileId client-side.
  usePreloadRoutes([categoriesQuery(), statsQuery(), myListingsQuery(), cartQuery()]);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = (onShoppingLog && activeTab === tab) || (tab === 'sell' && onSellDetail);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
              'relative rounded-full transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
              {Icon ? (
                <Icon className="mb-0.5 h-5 w-5" />
              ) : (
                <ShoppingLogMark size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/shoppinglog/config" isActive={isConfigActive} navId="shoppinglog-bottom-nav-active" />
    </nav>
  );
}
