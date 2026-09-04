// app/(logbook)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function LogbookLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('logbook');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
