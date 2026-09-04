// components/TaskLogBottomNav.tsx
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { KanbanSquareIcon, InboxIcon, TargetIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskLogMark } from '@/components/TaskLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';
import { Tappable } from '@/components/ui/tappable';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { usePreloadRoutes } from '@/lib/usePreloadRoutes';
import {
  todayTasksQuery,
  boardTasksQuery,
  inboxTasksQuery,
  ideasQuery,
  ideaTaskCountsQuery,
  goalsQuery,
} from '@/lib/tasklog/queries';

const tabs = [
  { tab: 'home', href: '/tasklog?tab=home', label: 'Home', Icon: null },
  { tab: 'board', href: '/tasklog?tab=board', label: 'Board', Icon: KanbanSquareIcon },
  { tab: 'plan', href: '/tasklog?tab=plan', label: 'Plan', Icon: InboxIcon },
  { tab: 'goals', href: '/tasklog?tab=goals', label: 'Goals', Icon: TargetIcon },
];

// useSearchParams (below) needs a Suspense boundary for prerendering — this
// wraps it here so every consumer gets it for free instead of each having
// to remember to.
export function TaskLogBottomNav() {
  return (
    <Suspense fallback={null}>
      <TaskLogBottomNavInner />
    </Suspense>
  );
}

function TaskLogBottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onTaskLog = pathname === '/tasklog';
  const activeTab = searchParams.get('tab') ?? 'home';
  const isConfigActive = pathname === '/tasklog/config' || pathname.startsWith('/tasklog/config/');

  // Warms every nav tab's data: Home, Board, Plan (which itself needs all
  // three of inboxTasksQuery/ideasQuery/ideaTaskCountsQuery), and Goals.
  const { profile } = useCurrentProfile();
  usePreloadRoutes(
    profile
      ? [
          todayTasksQuery(profile.id),
          boardTasksQuery(profile.id),
          inboxTasksQuery(profile.id),
          ideasQuery(profile.id),
          ideaTaskCountsQuery(profile.id),
          goalsQuery(profile.id),
        ]
      : []
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ tab, href, label, Icon }) => {
        const isActive = onTaskLog && activeTab === tab;
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
                layoutId="tasklog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Tappable className="relative z-10 flex flex-col items-center px-3 py-2 text-xs">
              {Icon ? (
                <Icon className="mb-0.5 h-5 w-5" />
              ) : (
                <TaskLogMark size={20} className="mb-0.5" />
              )}
              <span>{label}</span>
            </Tappable>
          </Link>
        );
      })}
      <ConfigMenu href="/tasklog/config" isActive={isConfigActive} navId="tasklog-bottom-nav-active" />
    </nav>
  );
}
