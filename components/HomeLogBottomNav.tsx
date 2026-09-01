// components/HomeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardListIcon, PackageIcon, ReceiptIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HomeLogMark } from '@/components/HomeLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/homelog', label: 'Home', Icon: null },
  { href: '/homelog/chores', label: 'Chores', Icon: ClipboardListIcon },
  { href: '/homelog/inventory', label: 'Inventory', Icon: PackageIcon },
  { href: '/homelog/bills', label: 'Bills', Icon: ReceiptIcon },
];

export function HomeLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/homelog/config' || pathname.startsWith('/homelog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/homelog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
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
              <HomeLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ConfigMenu href="/homelog/config" isActive={isConfigActive} navId="homelog-bottom-nav-active" />
    </nav>
  );
}
