// app/(burnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function BurnlogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('burnlog');
  }, []);

  return <>{children}</>;
}
