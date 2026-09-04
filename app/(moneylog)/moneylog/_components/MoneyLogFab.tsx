'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LogTransactionModal } from './LogTransactionModal';
import { ThemedButton } from '@/components/ui/themed-button';

type MoneyLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

export function MoneyLogFab({ profileId, onLogged }: MoneyLogFabProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ThemedButton
        slot="fab"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Log transaction"
      >
        <Plus className="h-6 w-6" />
      </ThemedButton>

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
