// app/(moneylog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function MoneylogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('moneylog');
  }, []);

  return <>{children}</>;
}
