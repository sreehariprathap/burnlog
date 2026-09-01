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

const tabs = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/session',   label: 'Plan', Icon: DumbbellIcon },
  { href: '/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/insights',  label: 'Insights', Icon: ChartLine },
];

export function BottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/dashboard/config' || pathname.startsWith('/dashboard/config/');

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
            className={cn(
              'relative flex flex-col items-center rounded-full px-2 py-2 text-xs transition-colors',
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
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ConfigMenu href="/dashboard/config" isActive={isConfigActive} navId="bottom-nav-active" />
    </nav>
  );
}
