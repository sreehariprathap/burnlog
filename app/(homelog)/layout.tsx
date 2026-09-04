// app/(homelog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function HomeLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('homelog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
