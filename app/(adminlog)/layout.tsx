// app/(adminlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

/** Every other app group sets its theme on mount; (adminlog) was the one
 * group without a layout, which meant two things: the previous app's
 * `.app-*` class was never cleared (AdminLog rendered in whatever palette
 * you arrived from), and `getActiveApp()` never returned 'adminlog', so
 * per-app theme/typography rows scoped to AdminLog could never apply even
 * though the scope pickers offer it. No PageTransition here — AdminLog
 * never had one, and this is only meant to fix the theme wiring. */
export default function AdminLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('adminlog');
  }, []);

  return <>{children}</>;
}
