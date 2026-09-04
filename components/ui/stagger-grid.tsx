'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
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
 * another on mount, when Micro Interactions is on. Renders as a plain,
 * unanimated `div` otherwise. Deliberately does NOT touch each item's own
 * className/layout — pass grid-placement classes (col-span, etc.) straight
 * through to `StaggerItem`, same as you'd put them on the item itself.
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
      {children}
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
    <motion.div className={className} variants={itemVariants} {...props}>
      {children}
    </motion.div>
  );
}
