// app/(sociallog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function SocialLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('sociallog');
  }, []);

  return <>{children}</>;
}
