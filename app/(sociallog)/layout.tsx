// app/(sociallog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function SocialLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-lifelog');
    document.documentElement.classList.remove('app-tasklog');
    document.documentElement.classList.remove('app-homelog');
    document.documentElement.classList.add('app-sociallog');
    setActiveApp('sociallog');
  }, []);

  return <>{children}</>;
}
