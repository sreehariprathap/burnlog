// components/MoneyLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClockIcon, TargetIcon, ChartLineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { MoneyLogProfileMenu } from '@/components/MoneyLogProfileMenu';

const tabs = [
  { href: '/moneylog', label: 'Home', Icon: null },
  { href: '/moneylog/plan', label: 'Plan', Icon: CalendarClockIcon },
  { href: '/moneylog/goals', label: 'Goals', Icon: TargetIcon },
  { href: '/moneylog/insights', label: 'Insights', Icon: ChartLineIcon },
];

export function MoneyLogBottomNav() {
  const pathname = usePathname();
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

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
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <MoneyLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <MoneyLogProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
