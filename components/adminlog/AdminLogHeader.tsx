// components/adminlog/AdminLogHeader.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AdminLogMark } from '@/components/AdminLogMark';
import { AppSwitcher } from '@/components/AppSwitcher';
import { findAdminNavItem } from '@/lib/adminlog/nav';

export function AdminLogHeader() {
  const pathname = usePathname();
  const isHome = pathname === '/adminlog';
  const current = findAdminNavItem(pathname);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <div
      className="sticky top-0 z-10 w-full bg-background/95 text-foreground shadow backdrop-blur-sm"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3 px-4 pb-3">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          aria-label="Switch app"
          className="flex items-center justify-center"
        >
          <AdminLogMark size={20} />
        </button>
        {!isHome && (
          <Link href="/adminlog" aria-label="Back to AdminLog" className="flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="font-header text-lg font-semibold truncate">
          {isHome ? 'AdminLog' : current?.item.label ?? 'AdminLog'}
        </h1>
      </div>

      <AppSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </div>
  );
}
