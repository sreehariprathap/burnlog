// lib/useConfirm.tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Styled, themeable replacement for `window.confirm()`. Renders the returned
 * `ConfirmDialog` element once anywhere in the component's JSX, then await
 * `confirm({...})` wherever a destructive-action confirmation is needed —
 * resolves `true`/`false` the same way `window.confirm` would, but matches
 * the app's own Dialog styling instead of the browser's native prompt.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(result: boolean) {
    setOpen(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }

  const ConfirmDialog = (
    <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{options.title}</DialogTitle>
          {options.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={options.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, ConfirmDialog };
}
