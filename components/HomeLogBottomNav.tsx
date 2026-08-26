// components/HomeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { HomeLogMark } from '@/components/HomeLogMark';
import { HomeLogProfileMenu } from '@/components/HomeLogProfileMenu';

// Only a Home tab for now — Chores/Inventory/Bills tabs land in their own
// follow-up sub-projects once those features exist.
export function HomeLogBottomNav() {
  const pathname = usePathname();
  const isHomeActive = pathname === '/homelog';
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      <Link
        href="/homelog"
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isHomeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <HomeLogMark size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">Home</span>
      </Link>
      <HomeLogProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
