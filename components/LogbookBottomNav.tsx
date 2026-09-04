// components/LogbookBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { LogbookMark } from '@/components/LogbookMark';
import { ProfileMenu } from '@/components/ProfileMenu';
import { cn } from '@/lib/utils';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { todayQuery, myDayQuery, todayKey } from '@/lib/logbook/queries';

export function LogbookBottomNav() {
  const pathname = usePathname();
  const isHomeActive = pathname === '/logbook';
  const isMyDayActive = pathname.startsWith('/logbook/myday');
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  // Warms Home's (and, since it shares the same key, /logbook/morning's)
  // today data, plus MyDay's default (today's date) view.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(profile ? [todayQuery(), myDayQuery(todayKey())] : []);

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      <Link
        href="/logbook"
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
          <LogbookMark size={20} className="mb-0.5" />
          <span>Logbook</span>
        </Tappable>
      </Link>
      <Link
        href="/logbook/myday"
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
