// app/(moneylog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function MoneylogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('moneylog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
