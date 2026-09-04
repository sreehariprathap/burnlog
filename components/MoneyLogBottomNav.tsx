// components/MoneyLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarClockIcon, TargetIcon, ChartLineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import { financialGoalsQuery, recurringItemsQuery, assetsQuery, allFinanceTransactionsQuery } from '@/lib/moneylog/queries';

const tabs = [
  { tab: 'home', href: '/moneylog?tab=home', label: 'Home', Icon: null },
  { tab: 'plan', href: '/moneylog?tab=plan', label: 'Plan', Icon: CalendarClockIcon },
  { tab: 'goals', href: '/moneylog?tab=goals', label: 'Goals', Icon: TargetIcon },
  { tab: 'insights', href: '/moneylog?tab=insights', label: 'Insights', Icon: ChartLineIcon },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function MoneyLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <MoneyLogBottomNavInner />
    </Suspense>
  );
}

function MoneyLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onMoneyLog = pathname === '/moneylog';
  const activeTab = searchParams.get('tab') ?? 'home';
  const isConfigActive = pathname === '/moneylog/config' || pathname.startsWith('/moneylog/config/');

  // Warms every tab's data (Insights now client-fetches too, since /moneylog
  // is a single tabbed page) plus the Assets deep page, so switching tabs
  // after this nav has been mounted a moment renders from cache instead of
  // a fresh fetch.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [
          financialGoalsQuery(profile.id),
          recurringItemsQuery(profile.id),
          assetsQuery(),
          allFinanceTransactionsQuery(profile.id),
        ]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = onMoneyLog && activeTab === tab;
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
