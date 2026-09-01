// app/(shoppinglog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function ShoppingLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('shoppinglog');
  }, []);

  return <>{children}</>;
}
