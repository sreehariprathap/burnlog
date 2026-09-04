// components/MoneyLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClockIcon, TargetIcon, ChartLineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { financialGoalsQuery, recurringItemsQuery, assetsQuery } from '@/lib/moneylog/queries';

const tabs = [
  { href: '/moneylog', label: 'Home', Icon: null },
  { href: '/moneylog/plan', label: 'Plan', Icon: CalendarClockIcon },
  { href: '/moneylog/goals', label: 'Goals', Icon: TargetIcon },
  { href: '/moneylog/insights', label: 'Insights', Icon: ChartLineIcon },
];

export function MoneyLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/moneylog/config' || pathname.startsWith('/moneylog/config/');

  // Warms Plan, Goals, and the Assets deep page (Insights stays
  // server-rendered — see this plan's "Explicitly NOT modified" note) so
  // switching tabs after this nav has been mounted a moment renders from
  // cache instead of a fresh fetch.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [financialGoalsQuery(profile.id), recurringItemsQuery(profile.id), assetsQuery()]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/moneylog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
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
                <MoneyLogMark size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/moneylog/config" isActive={isConfigActive} navId="moneylog-bottom-nav-active" />
    </nav>
  );
}
