// app/(sociallog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { PageTransition } from '@/components/ui/page-transition';

export default function SocialLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('sociallog');
  }, []);

  return <PageTransition>{children}</PageTransition>;
}
