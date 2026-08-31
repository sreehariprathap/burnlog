// app/(tasklog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function TaskLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-logbook');
    document.documentElement.classList.remove('app-moneylog');
    document.documentElement.classList.remove('app-homelog');
    document.documentElement.classList.remove('app-sociallog');
    document.documentElement.classList.remove('app-shoppinglog');
    document.documentElement.classList.add('app-tasklog');
    setActiveApp('tasklog');
  }, []);

  return <>{children}</>;
}
