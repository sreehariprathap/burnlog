// components/adminlog/AdminLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, DEFAULT_ADMIN_CATEGORY } from '@/lib/adminlog/nav';

export function AdminLogBottomNav() {
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get('category') ?? DEFAULT_ADMIN_CATEGORY;

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Admin categories"
    >
      {ADMIN_NAV.map(({ key, label, icon: Icon }) => {
        const isActive = activeCategory === key;
        return (
          <Link
            key={key}
            href={`/adminlog?category=${key}`}
            prefetch
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="adminlog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
