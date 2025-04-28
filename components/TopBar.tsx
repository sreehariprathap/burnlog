// components/TopBar.tsx
'use client';

import { X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import Image from 'next/image';

interface TopBarProps {
  title: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, onClose, actions }: TopBarProps) {
  return (
    <div className="w-full bg-background text-foreground shadow p-4 sticky top-0 z-10 relative flex justify-between">
      <div className='flex gap-3 items-center'>
      <Image
        src="/B.png" 
        alt="Logo"
        width={20}
        height={20}
        />
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
    </div>
  );
}
