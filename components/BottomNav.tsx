// components/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  HomeIcon,
  DumbbellIcon,
  TargetIcon,
  ChartLine
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { fitnessGoalsQuery, workoutPlanQuery } from '@/lib/burnlog/queries';

const tabs = [
  { href: '/burnlog/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/burnlog/session',   label: 'Plan', Icon: DumbbellIcon },
  { href: '/burnlog/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/burnlog/insights',  label: 'Insights', Icon: ChartLine },
];

export function BottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/burnlog/dashboard/config' || pathname.startsWith('/burnlog/dashboard/config/');

  // Warms the caches Dashboard, Goals, and Session read from (Insights
  // stays server-rendered — see the spec's "out of scope" note — so it
  // isn't preloadable via this mechanism) so switching tabs after this nav
  // has been mounted a moment renders from cache instead of a fresh fetch.
  const { profile } = useCurrentProfile();
  const today = new Date().getDay();
  usePreloadRoutes(
    profile
      ? [fitnessGoalsQuery(profile.id), workoutPlanQuery(profile.id, today)]
      : []
  );

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
            prefetch
            className={cn(
              'relative rounded-full transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Tappable className="relative z-10 flex flex-col items-center px-2 py-2 text-xs">
              <Icon className="mb-0.5 h-5 w-5" />
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/burnlog/dashboard/config" isActive={isConfigActive} navId="bottom-nav-active" />
    </nav>
  );
}
