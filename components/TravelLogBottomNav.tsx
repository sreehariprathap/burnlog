// components/TravelLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { MapIcon, UsersIcon, SparklesIcon, PiggyBankIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TravelLogMark } from '@/components/TravelLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { visitsQuery, tripsQuery, weeklySuggestionsQuery } from '@/lib/travellog/queries';

const tabs = [
  { tab: 'home', href: '/travellog?tab=home', label: 'Home', Icon: null },
  { tab: 'map', href: '/travellog?tab=map', label: 'Map', Icon: MapIcon },
  { tab: 'trips', href: '/travellog?tab=trips', label: 'Trips', Icon: UsersIcon },
  { tab: 'plan', href: '/travellog?tab=plan', label: 'Plan', Icon: SparklesIcon },
  { tab: 'suggestions', href: '/travellog?tab=suggestions', label: 'Suggest', Icon: PiggyBankIcon },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function TravelLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <TravelLogBottomNavInner />
    </Suspense>
  );
}

function TravelLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onTravelLog = pathname === '/travellog';
  const activeTab = searchParams.get('tab') ?? 'home';
  const isConfigActive = pathname === '/travellog/config' || pathname.startsWith('/travellog/config/');
  // A trip's own detail page (/travellog/trips/[id]) is a real, separate
  // route (not a tab) — still highlight Trips while viewing one, matching
  // the old pathname-based check's behavior there.
  const onTripDetail = pathname.startsWith('/travellog/trips/');

  // Warms Home/Map (shared visitsQuery), Trips, and Suggestions' weekly
  // list. Plan has no page-level query to preload (an AI-generation form,
  // not a list/lookup page).
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [visitsQuery(profile.id), tripsQuery(), weeklySuggestionsQuery(profile.id)]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = (onTravelLog && activeTab === tab) || (tab === 'trips' && onTripDetail);
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
                layoutId="travellog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
              {Icon ? (
                <Icon className="mb-0.5 h-5 w-5" />
              ) : (
                <TravelLogMark size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/travellog/config" isActive={isConfigActive} navId="travellog-bottom-nav-active" />
    </nav>
  );
}
