// components/SocialLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { statsQuery, threadsQuery } from '@/lib/sociallog/queries';

const tabs = [
  { tab: 'home', href: '/sociallog?tab=home', label: 'Home', Icon: null },
  { tab: 'search', href: '/sociallog?tab=search', label: 'Search', Icon: SearchIcon },
  { tab: 'messages', href: '/sociallog?tab=messages', label: 'Messages', Icon: MessageCircleIcon },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function SocialLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <SocialLogBottomNavInner />
    </Suspense>
  );
}

function SocialLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onSocialLog = pathname === '/sociallog';
  const activeTab = searchParams.get('tab') ?? 'home';
  const isConfigActive = pathname === '/sociallog/config' || pathname.startsWith('/sociallog/config/');
  // A conversation's own page (/sociallog/messages/[threadId]) is a real,
  // separate route (not a tab) — still highlight Messages while viewing
  // one, matching the old pathname-based check's behavior there.
  const onThreadDetail = pathname.startsWith('/sociallog/messages/');

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
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = (onSocialLog && activeTab === tab) || (tab === 'messages' && onThreadDetail);
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
