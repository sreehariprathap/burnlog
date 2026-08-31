// components/TaskLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { KanbanSquareIcon, InboxIcon, TargetIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskLogMark } from '@/components/TaskLogMark';
import { TaskLogProfileMenu } from '@/components/TaskLogProfileMenu';

const tabs = [
  { href: '/tasklog', label: 'Home', Icon: null },
  { href: '/tasklog/board', label: 'Board', Icon: KanbanSquareIcon },
  { href: '/tasklog/plan', label: 'Plan', Icon: InboxIcon },
  { href: '/tasklog/goals', label: 'Goals', Icon: TargetIcon },
];

export function TaskLogBottomNav() {
  const pathname = usePathname();
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/tasklog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
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
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <TaskLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <TaskLogProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
