'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

/**
 * Fades/slides between pages on navigation, keyed by pathname — but only
 * when Micro Interactions is on (AdminLog -> UI & Themes). Renders
 * `children` completely unwrapped otherwise, so this is a no-op until an
 * admin turns it on.
 *
 * mode="popLayout" (not "wait"): the incoming page mounts immediately
 * while the outgoing one animates out of flow, rather than leaving a
 * blank gap while the outgoing page's exit finishes. A page briefly having
 * two mounted copies of itself is safe here — the app's only two realtime
 * subscriptions (NotificationBell, sociallog's thread page) both guard
 * against a duplicate channel for the same topic; see their comments.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = useMicroInteractionsEnabled();

  if (!enabled) return <>{children}</>;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
