// app/(burnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function BurnlogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('burnlog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
