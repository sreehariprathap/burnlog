'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('logbook');
  }, []);

  return <>{children}</>;
}
