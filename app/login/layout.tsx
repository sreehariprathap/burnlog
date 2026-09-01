// app/login/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('logbook');
  }, []);

  return <>{children}</>;
}
