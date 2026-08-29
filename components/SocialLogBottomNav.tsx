// components/SocialLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SocialLogMark } from '@/components/SocialLogMark';
import { SocialLogProfileMenu } from '@/components/SocialLogProfileMenu';

const tabs = [
  { href: '/sociallog', label: 'Home', Icon: null },
  { href: '/sociallog/search', label: 'Search', Icon: SearchIcon },
  { href: '/sociallog/messages', label: 'Messages', Icon: MessageCircleIcon },
];

export function SocialLogBottomNav() {
  const pathname = usePathname();
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/sociallog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
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
              <SocialLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <SocialLogProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
