// components/LearnLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { LibraryIcon, DumbbellIcon, BriefcaseIcon, NotebookPenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LearnLogMark } from '@/components/LearnLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import {
  homeDataQuery,
  libraryItemsQuery,
  skillsQuery,
  rolesQuery,
  certsQuery,
  goalsQuery,
  reflectionsQuery,
} from '@/lib/learnlog/queries';

const tabs = [
  { href: '/learnlog', label: 'Home', Icon: null },
  { href: '/learnlog/library', label: 'Library', Icon: LibraryIcon },
  { href: '/learnlog/skills', label: 'Skills', Icon: DumbbellIcon },
  { href: '/learnlog/career', label: 'Career', Icon: BriefcaseIcon },
  { href: '/learnlog/reflections', label: 'Reflect', Icon: NotebookPenIcon },
];

export function LearnLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/learnlog/config' || pathname.startsWith('/learnlog/config/');

  // Warms every nav tab's data: Home, Library, Skills, Career (roles +
  // certs + goals), and Reflections.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [
          homeDataQuery(profile.id),
          libraryItemsQuery(profile.id),
          skillsQuery(profile.id),
          rolesQuery(profile.id),
          certsQuery(profile.id),
          goalsQuery(profile.id),
          reflectionsQuery(profile.id),
        ]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/learnlog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="learnlog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <LearnLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ConfigMenu href="/learnlog/config" isActive={isConfigActive} navId="learnlog-bottom-nav-active" />
    </nav>
  );
}
