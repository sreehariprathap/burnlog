// components/DevErrorWatcher.tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { subscribeDevError, reportDevError, type DevErrorReport } from '@/lib/devError';
import { isDevErrorModeEnabled } from '@/lib/devErrorMode';

/**
 * Admin-only dev feature: mounted once at the root, listens for every error
 * reported via lib/devError.ts (React render errors, apiFetch failures,
 * uncaught window errors, unhandled promise rejections) and shows the
 * latest one in a dismissable dialog. Re-checks isAdmin + the localStorage
 * toggle on every report, so flipping the toggle on /profile takes effect
 * immediately without a reload.
 */
export function DevErrorWatcher() {
  const { profile } = useCurrentProfile();
  const [report, setReport] = useState<DevErrorReport | null>(null);

  useEffect(() => {
    return subscribeDevError((next) => {
      if (profile?.isAdmin && isDevErrorModeEnabled()) {
        setReport(next);
      }
    });
  }, [profile?.isAdmin]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportDevError(event.error ?? event.message, 'Uncaught error');
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportDevError(event.reason, 'Unhandled promise rejection');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <Dialog open={report !== null} onOpenChange={(open) => !open && setReport(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Error: {report?.source}</DialogTitle>
          <DialogDescription>{report?.message}</DialogDescription>
        </DialogHeader>
        {report?.stack && (
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
            {report.stack}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
