// app/(learnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function LearnLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('learnlog');
  }, []);

  return <>{children}</>;
}
