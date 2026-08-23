// components/BootRedirect.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { APPS, getDefaultApp, setActiveApp } from '@/lib/appMode';

export function BootRedirect() {
  const router = useRouter();

  useEffect(() => {
    const app = getDefaultApp();
    setActiveApp(app);
    router.replace(APPS[app].home);
  }, [router]);

  return null;
}
