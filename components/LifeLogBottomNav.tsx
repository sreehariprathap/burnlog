// components/LifeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/lifelog', label: 'Home', Icon: WalletIcon },
];

export function LifeLogBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
