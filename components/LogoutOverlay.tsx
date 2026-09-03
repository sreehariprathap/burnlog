// components/LogoutOverlay.tsx
'use client';

import { useEffect } from 'react';
import PowerOffSlide from '@/components/smoothui/power-off-slide';

interface LogoutOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

/** Mobile-only, full-screen slide-to-log-out confirmation. */
export function LogoutOverlay({ open, onOpenChange, onConfirm }: LogoutOverlayProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Log out"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-medium text-foreground">Log out of LogBook?</p>
        <PowerOffSlide label="Slide to log out" onPowerOff={onConfirm} />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="text-sm text-muted-foreground underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
