'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('logbook');
  }, []);

  return <>{children}</>;
}
