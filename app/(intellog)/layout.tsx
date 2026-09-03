// app/(intellog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { IntelLogBottomNav } from '@/components/IntelLogBottomNav';

export default function IntelLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('intellog');
  }, []);

  return (
    <>
      {children}
      <IntelLogBottomNav />
    </>
  );
}
