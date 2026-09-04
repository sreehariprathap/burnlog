// components/LogbookBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { ProfileMenu } from '@/components/ProfileMenu';
import { cn } from '@/lib/utils';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { todayQuery, myDayQuery, todayKey } from '@/lib/logbook/queries';

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer (the /logbook page, /profile's page)
// gets it for free instead of each having to remember to.
export function LogbookBottomNav() {
  return (
    <Suspense fallback={null}>
      <LogbookBottomNavInner />
    </Suspense>
  );
}

function LogbookBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // /logbook is a single page now — Home vs MyDay is which `?tab=` is
  // active, not which route. /profile is still its own real route and
  // also mounts this nav (see app/profile/page.tsx), so pathname alone
  // decides Home/MyDay only while actually on /logbook.
  const onLogbook = pathname === '/logbook';
  const tab = searchParams.get('tab') ?? 'home';
  const isHomeActive = onLogbook && tab !== 'myday';
  const isMyDayActive = onLogbook && tab === 'myday';
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  // Warms Home's (and, since it shares the same key, /logbook/morning's)
  // today data, plus MyDay's default (today's date) view.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(profile ? [todayQuery(), myDayQuery(todayKey())] : []);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
      data-tour="bottom-nav"
    >
      <Link
        href="/logbook?tab=home"
        prefetch
        aria-label="Logbook"
        aria-current={isHomeActive ? 'page' : undefined}
        className={cn(
          'relative rounded-full transition-colors',
          isHomeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isHomeActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
          <AppIcon id="logbook" size={20} className="mb-0.5" />
          <span>Logbook</span>
        </Tappable>
      </Link>
      <Link
        href="/logbook?tab=myday"
        prefetch
        aria-label="MyDay"
        aria-current={isMyDayActive ? 'page' : undefined}
        className={cn(
          'relative rounded-full transition-colors',
          isMyDayActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isMyDayActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
          <CalendarClock size={20} className="mb-0.5" />
          <span>MyDay</span>
        </Tappable>
      </Link>
      <ProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
