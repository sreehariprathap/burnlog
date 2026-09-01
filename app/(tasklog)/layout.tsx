// app/(tasklog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function TaskLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('tasklog');
  }, []);

  return <>{children}</>;
}
