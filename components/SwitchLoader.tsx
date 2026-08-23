// components/SwitchLoader.tsx
'use client';

import { Loader2 } from 'lucide-react';
import { useAppSwitch } from '@/lib/appSwitchContext';
import { APPS } from '@/lib/appMode';

export function SwitchLoader() {
  const { switchingTo } = useAppSwitch();

  if (!switchingTo) return null;

  const app = APPS[switchingTo];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Switching to {app.name}…</p>
    </div>
  );
}
