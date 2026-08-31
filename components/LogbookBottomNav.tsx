// components/LogbookBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { LogbookMark } from '@/components/LogbookMark';
import { ProfileMenu } from '@/components/ProfileMenu';
import { cn } from '@/lib/utils';

export function LogbookBottomNav() {
  const pathname = usePathname();
  const isHomeActive = pathname === '/logbook';
  const isMyDayActive = pathname.startsWith('/logbook/myday');
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      <Link
        href="/logbook"
        aria-label="Logbook"
        aria-current={isHomeActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isHomeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isHomeActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <LogbookMark size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">Logbook</span>
      </Link>
      <Link
        href="/logbook/myday"
        aria-label="MyDay"
        aria-current={isMyDayActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isMyDayActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isMyDayActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <CalendarClock size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">MyDay</span>
      </Link>
      <ProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
