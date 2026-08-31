// components/TopBar.tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { AppSwitcher } from './AppSwitcher';
import { MoneyLogMark } from './MoneyLogMark';
import { TaskLogMark } from './TaskLogMark';
import { HomeLogMark } from './HomeLogMark';
import { SocialLogMark } from './SocialLogMark';
import { ShoppingLogMark } from './ShoppingLogMark';
import { LogbookMark } from './LogbookMark';
import Image from 'next/image';
import { AppId, getActiveApp } from '@/lib/appMode';

interface TopBarProps {
  title: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, onClose, actions }: TopBarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeApp, setActiveAppState] = useState<AppId>('logbook');

  useEffect(() => {
    setActiveAppState(getActiveApp());
  }, []);

  return (
    <div
      className="w-full bg-background text-foreground shadow p-4 sticky top-0 z-10 relative flex justify-between"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className='flex gap-3 items-center'>
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          aria-label="Switch app"
          className="flex items-center justify-center"
        >
          {activeApp === 'logbook' ? (
            <LogbookMark size={20} />
          ) : activeApp === 'moneylog' ? (
            <MoneyLogMark size={20} />
          ) : activeApp === 'tasklog' ? (
            <TaskLogMark size={20} />
          ) : activeApp === 'homelog' ? (
            <HomeLogMark size={20} />
          ) : activeApp === 'sociallog' ? (
            <SocialLogMark size={20} />
          ) : activeApp === 'shoppinglog' ? (
            <ShoppingLogMark size={20} />
          ) : (
            <Image src="/B.png" alt="Logo" width={20} height={20} />
          )}
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {onClose && (
          <button
            className="ml-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        )}
      </div>
      <AppSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </div>
  );
}
