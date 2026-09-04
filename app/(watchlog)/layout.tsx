// app/(watchlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function WatchLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('watchlog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
