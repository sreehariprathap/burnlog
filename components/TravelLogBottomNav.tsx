// components/TravelLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  { href: '/travellog', label: 'Home', Icon: null },
  { href: '/travellog/map', label: 'Map', Icon: MapIcon },
  { href: '/travellog/trips', label: 'Trips', Icon: UsersIcon },
  { href: '/travellog/plan', label: 'Plan', Icon: SparklesIcon },
  { href: '/travellog/suggestions', label: 'Suggest', Icon: PiggyBankIcon },
];

export function TravelLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/travellog/config' || pathname.startsWith('/travellog/config/');

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
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/travellog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
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
