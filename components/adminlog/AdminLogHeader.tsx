// components/adminlog/AdminLogHeader.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, findAdminNavItem } from '@/lib/adminlog/nav';

export function AdminLogHeader() {
  const pathname = usePathname();
  const isHome = pathname === '/adminlog';
  const current = findAdminNavItem(pathname);

  return (
    <div
      className="sticky top-0 z-10 w-full bg-background/95 text-foreground shadow backdrop-blur-sm"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3 px-4 pb-3">
        {isHome ? (
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
        ) : (
          <Link href="/adminlog" aria-label="Back to AdminLog" className="flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="font-header text-lg font-semibold truncate">
          {isHome ? 'AdminLog' : current?.item.label ?? 'AdminLog'}
        </h1>
      </div>

      {isHome && (
        <nav aria-label="Admin categories" className="flex gap-2 overflow-x-auto px-4 pb-3">
          {ADMIN_NAV.map((category) => {
            const Icon = category.icon;
            return (
              <a
                key={category.key}
                href={`#category-${category.key}`}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {category.label}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}
