// components/LearnLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { LibraryIcon, DumbbellIcon, BriefcaseIcon, NotebookPenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppIcon } from '@/components/AppIcon';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
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
  { tab: 'home', href: '/learnlog?tab=home', label: 'Home', Icon: null },
  { tab: 'library', href: '/learnlog?tab=library', label: 'Library', Icon: LibraryIcon },
  { tab: 'skills', href: '/learnlog?tab=skills', label: 'Skills', Icon: DumbbellIcon },
  { tab: 'career', href: '/learnlog?tab=career', label: 'Career', Icon: BriefcaseIcon },
  { tab: 'reflections', href: '/learnlog?tab=reflections', label: 'Reflect', Icon: NotebookPenIcon },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function LearnLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <LearnLogBottomNavInner />
    </Suspense>
  );
}

function LearnLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onLearnLog = pathname === '/learnlog';
  const activeTab = searchParams.get('tab') ?? 'home';
  const isConfigActive = pathname === '/learnlog/config' || pathname.startsWith('/learnlog/config/');
  // A skill's own detail page (/learnlog/skills/[id]) is a real, separate
  // route (not a tab) — still highlight Skills while viewing one, matching
  // the old pathname-based check's behavior there.
  const onSkillDetail = pathname.startsWith('/learnlog/skills/');

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
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = (onLearnLog && activeTab === tab) || (tab === 'skills' && onSkillDetail);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative rounded-full transition-colors',
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
            <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
              {Icon ? (
                <Icon className="mb-0.5 h-5 w-5" />
              ) : (
                <AppIcon id="learnlog" size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/learnlog/config" isActive={isConfigActive} navId="learnlog-bottom-nav-active" />
    </nav>
  );
}
