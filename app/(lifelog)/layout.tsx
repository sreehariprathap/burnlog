// app/(lifelog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function LifelogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-tasklog');
    document.documentElement.classList.remove('app-homelog');
    document.documentElement.classList.add('app-lifelog');
    setActiveApp('lifelog');
  }, []);

  return <>{children}</>;
}
