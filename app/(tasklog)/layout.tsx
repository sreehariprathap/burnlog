// app/(tasklog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function TaskLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('tasklog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
