// components/WatchLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ListVideo, Compass, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppIcon } from '@/components/AppIcon';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { watchItemsQuery } from '@/lib/watchlog/queries';

const tabs = [
  { tab: 'home', href: '/watchlog?tab=home', label: 'Home', Icon: null },
  { tab: 'watchlist', href: '/watchlog?tab=watchlist', label: 'Watchlist', Icon: ListVideo },
  { tab: 'discover', href: '/watchlog?tab=discover', label: 'Discover', Icon: Compass },
  { tab: 'stats', href: '/watchlog?tab=stats', label: 'Stats', Icon: BarChart3 },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function WatchLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <WatchLogBottomNavInner />
    </Suspense>
  );
}

function WatchLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onWatchLog = pathname === '/watchlog';
  const activeTab = searchParams.get('tab') ?? 'home';

  // Warms every nav tab's data: the default watchlist and the
  // continue-watching slice Home reads.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [watchItemsQuery(profile.id), watchItemsQuery(profile.id, 'watching')]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = onWatchLog && activeTab === tab;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative rounded-full transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="watchlog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
              {Icon ? (
                <Icon className="mb-0.5 h-5 w-5" />
              ) : (
                <AppIcon id="watchlog" size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
    </nav>
  );
}
