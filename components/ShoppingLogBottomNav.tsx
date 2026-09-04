// components/ShoppingLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusCircleIcon, ShoppingCartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { categoriesQuery, statsQuery, myListingsQuery, cartQuery } from '@/lib/shoppinglog/queries';

const tabs = [
  { href: '/shoppinglog', label: 'Browse', Icon: null },
  { href: '/shoppinglog/sell', label: 'Sell', Icon: PlusCircleIcon },
  { href: '/shoppinglog/cart', label: 'Cart', Icon: ShoppingCartIcon },
];

export function ShoppingLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/shoppinglog/config' || pathname.startsWith('/shoppinglog/config/');

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
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/shoppinglog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
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
