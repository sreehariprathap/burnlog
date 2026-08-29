// components/ShoppingLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusCircleIcon, ShoppingCartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { ShoppingLogProfileMenu } from '@/components/ShoppingLogProfileMenu';

const tabs = [
  { href: '/shoppinglog', label: 'Browse', Icon: null },
  { href: '/shoppinglog/sell', label: 'Sell', Icon: PlusCircleIcon },
  { href: '/shoppinglog/cart', label: 'Cart', Icon: ShoppingCartIcon },
];

export function ShoppingLogBottomNav() {
  const pathname = usePathname();
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

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
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <ShoppingLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ShoppingLogProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
