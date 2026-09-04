'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

/**
 * Fades between pages on navigation, keyed by pathname — but only when
 * Micro Interactions is on (AdminLog -> UI). Renders `children` completely
 * unwrapped otherwise, so this is a no-op until an admin turns it on.
 *
 * Opacity-only — deliberately no x/y/scale/rotate. Every page renders its
 * own BottomNav as a descendant of this wrapper, and a `transform` on ANY
 * ancestor of a `position: fixed` element (even a no-op `translateX(0px)`
 * at rest) makes that fixed element position itself relative to the
 * transformed ancestor instead of the viewport — so a slide animation here
 * would make the bottom nav drift with the page instead of staying pinned
 * on scroll. Motion only writes a `transform` style when a transform-value
 * (x/y/scale/etc.) is actually animated, so staying opacity-only means this
 * wrapper never gets one.
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
