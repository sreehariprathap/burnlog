'use client';

import * as React from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

// motion.div redefines these drag/animation event handlers with its own
// signatures, which conflict with the native DOM ones — omit them from the
// passthrough type so spreading `...props` onto motion.div typechecks.
type SafeDivProps = Omit<
  React.ComponentPropsWithoutRef<'div'>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
>;

/**
 * Wraps a list/grid of `StaggerItem`s so they fade+slide in one after
 * another on mount, reflow smoothly when siblings are added/removed/
 * reordered, and fade+slide out on removal — all only when Micro
 * Interactions is on. Renders as a plain, unanimated `div` otherwise.
 * Deliberately does NOT touch each item's own className/layout — pass
 * grid-placement classes (col-span, etc.) straight through to
 * `StaggerItem`, same as you'd put them on the item itself.
 *
 * Each `StaggerItem` needs a stable `key` (its data's id, not index) for
 * AnimatePresence to tell an add/remove apart from a value update.
 */
export function StaggerGrid({ className, children, ...props }: SafeDivProps) {
  const enabled = useMicroInteractionsEnabled();

  if (!enabled) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div className={className} initial="hidden" animate="show" variants={containerVariants} {...props}>
      <AnimatePresence mode="popLayout" initial={false}>
        {children}
      </AnimatePresence>
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...props }: SafeDivProps) {
  const enabled = useMicroInteractionsEnabled();

  if (!enabled) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div layout className={className} variants={itemVariants} exit="exit" {...props}>
      {children}
    </motion.div>
  );
}
