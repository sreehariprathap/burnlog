// components/AppSwitcher.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Wallet } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { APPS, AppId, getActiveApp, getDefaultApp, setDefaultApp } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';

interface AppSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSwitcher({ open, onOpenChange }: AppSwitcherProps) {
  const { switchTo } = useAppSwitch();
  const [activeApp, setActiveAppState] = useState<AppId>('burnlog');
  const [defaultApp, setDefaultAppState] = useState<AppId>('burnlog');

  useEffect(() => {
    if (!open) return;
    setActiveAppState(getActiveApp());
    setDefaultAppState(getDefaultApp());
  }, [open]);

  function handleSelect(id: AppId) {
    if (id === activeApp) return;
    onOpenChange(false);
    switchTo(id);
  }

  function handleSetDefault(id: AppId) {
    setDefaultApp(id);
    setDefaultAppState(id);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Switch app</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-3 p-4 pb-8">
          {Object.values(APPS).map((app) => (
            <Card
              key={app.id}
              onClick={() => handleSelect(app.id)}
              className={`cursor-pointer transition-colors ${
                activeApp === app.id ? 'border-primary' : ''
              }`}
            >
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-3">
                  {app.id === 'lifelog' ? (
                    <Wallet className="h-6 w-6 text-primary" />
                  ) : (
                    <Image src="/B.png" alt={app.name} width={24} height={24} />
                  )}
                  <div>
                    <p className="font-semibold">
                      {app.name}
                      {activeApp === app.id ? ' (Active)' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{app.tagline}</p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-muted-foreground">Default</span>
                  <Switch
                    checked={defaultApp === app.id}
                    onCheckedChange={() => handleSetDefault(app.id)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
