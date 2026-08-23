// app/(burnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function BurnlogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-lifelog');
    setActiveApp('burnlog');
  }, []);

  return <>{children}</>;
}
