// app/(travellog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function TravelLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('travellog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
