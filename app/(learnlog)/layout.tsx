// app/(learnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function LearnLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('learnlog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
