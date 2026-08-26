// app/(homelog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function HomeLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-lifelog');
    document.documentElement.classList.remove('app-tasklog');
    document.documentElement.classList.add('app-homelog');
    setActiveApp('homelog');
  }, []);

  return <>{children}</>;
}
