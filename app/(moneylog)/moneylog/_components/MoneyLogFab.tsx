'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LogTransactionModal } from './LogTransactionModal';

type MoneyLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

export function MoneyLogFab({ profileId, onLogged }: MoneyLogFabProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Log transaction"
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <LogTransactionModal
          profileId={profileId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onLogged();
          }}
        />
      )}
    </>
  );
}
