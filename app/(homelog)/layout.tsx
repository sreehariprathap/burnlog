// app/(homelog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function HomeLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('homelog');
  }, []);

  return <>{children}</>;
}
