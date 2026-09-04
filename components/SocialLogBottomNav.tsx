// components/SocialLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { statsQuery, threadsQuery } from '@/lib/sociallog/queries';

const tabs = [
  { href: '/sociallog', label: 'Home', Icon: null },
  { href: '/sociallog/search', label: 'Search', Icon: SearchIcon },
  { href: '/sociallog/messages', label: 'Messages', Icon: MessageCircleIcon },
];

export function SocialLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/sociallog/config' || pathname.startsWith('/sociallog/config/');

  // Warms Home's stats and Messages' thread list. Search has no
  // page-level query (search-as-you-type, no stable key to preload).
  // Session-scoped server-side like ShoppingLog — no useCurrentProfile()
  // gate needed for the preload call itself.
  usePreloadRoutes([statsQuery(), threadsQuery()]);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/sociallog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
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
                <SocialLogMark size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/sociallog/config" isActive={isConfigActive} navId="sociallog-bottom-nav-active" />
    </nav>
  );
}
