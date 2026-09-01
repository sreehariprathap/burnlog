// app/(travellog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function TravelLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('travellog');
  }, []);

  return <>{children}</>;
}
