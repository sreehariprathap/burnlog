// components/AppSwitcher.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { BurnLogMark } from '@/components/BurnLogMark';
import { LogbookMark } from '@/components/LogbookMark';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { TaskLogMark } from '@/components/TaskLogMark';
import { HomeLogMark } from '@/components/HomeLogMark';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { TravelLogMark } from '@/components/TravelLogMark';
import { LearnLogMark } from '@/components/LearnLogMark';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { APPS, AppId, getActiveApp, getDefaultApp, setDefaultApp, getEnabledApps } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';

interface AppSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LONG_PRESS_MS = 500;

function AppIcon({ id, size }: { id: AppId; size: number }) {
  switch (id) {
    case 'logbook':
      return <LogbookMark size={size} />;
    case 'moneylog':
      return <MoneyLogMark size={size} />;
    case 'tasklog':
      return <TaskLogMark size={size} />;
    case 'homelog':
      return <HomeLogMark size={size} />;
    case 'sociallog':
      return <SocialLogMark size={size} />;
    case 'shoppinglog':
      return <ShoppingLogMark size={size} />;
    case 'travellog':
      return <TravelLogMark size={size} />;
    case 'learnlog':
      return <LearnLogMark size={size} />;
    default:
      return <BurnLogMark size={size} />;
  }
}

export function AppSwitcher({ open, onOpenChange }: AppSwitcherProps) {
  const { switchTo } = useAppSwitch();
  const [activeApp, setActiveAppState] = useState<AppId>('logbook');
  const [defaultApp, setDefaultAppState] = useState<AppId>('logbook');
  const [visibleApps, setVisibleApps] = useState(Object.values(APPS));
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    if (!open) return;
    const active = getActiveApp();
    setActiveAppState(active);
    setDefaultAppState(getDefaultApp());
    const enabled = getEnabledApps();
    const eligible = enabled
      ? Object.values(APPS).filter((app) => app.id === 'logbook' || enabled.includes(app.id))
      : Object.values(APPS);
    // The app you're already in never appears in its own hub.
    setVisibleApps(eligible.filter((app) => app.id !== active));
  }, [open]);

  function handleSelect(id: AppId) {
    if (id === activeApp) return;
    onOpenChange(false);
    switchTo(id);
  }

  function startLongPress(id: AppId) {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setDefaultApp(id);
      setDefaultAppState(id);
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTap(id: AppId) {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    handleSelect(id);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Apps</DrawerTitle>
        </DrawerHeader>
        <div className="grid grid-cols-4 gap-4 p-4 pb-8 overflow-y-auto">
          {visibleApps.map((app, index) => (
            <motion.button
              key={app.id}
              type="button"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: index * 0.03 }}
              onPointerDown={() => startLongPress(app.id)}
              onPointerUp={() => cancelLongPress()}
              onPointerLeave={() => cancelLongPress()}
              onClick={() => handleTap(app.id)}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <AppIcon id={app.id} size={28} />
                {defaultApp === app.id && (
                  <Star
                    size={14}
                    className="absolute -top-1 -right-1 fill-primary text-primary"
                  />
                )}
              </div>
              <span className="text-xs text-center leading-tight truncate w-full">
                {app.name}
              </span>
            </motion.button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
