// app/(shoppinglog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function ShoppingLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('shoppinglog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
