// components/TopBar.tsx
'use client';

import { X } from 'lucide-react';

interface TopBarProps {
  title: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, onClose, actions }: TopBarProps) {
  return (
    <div className="w-full bg-white shadow p-4 sticky top-0 z-10 relative flex justify-between">
      <h1 className="text-lg font-semibold">{title}</h1>
      {onClose && (
        <button
          className="absolute right-4 top-4"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={24} />
        </button>
      )}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
