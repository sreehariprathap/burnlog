'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

// motion.div redefines these drag/animation event handlers with its own
// signatures, which conflict with the native DOM ones — omit them from the
// passthrough type so spreading `...props` onto motion.div typechecks.
type SafeDivProps = Omit<
  React.ComponentPropsWithoutRef<'div'>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
>;

export interface TappableProps extends SafeDivProps {
  /** Press-scale amount, 0-1. Defaults to a subtle 0.96. */
  pressScale?: number;
}

/**
 * Adds tap/press feedback (and a slight hover lift) to whatever it wraps,
 * but only when an admin has turned on Micro Interactions
 * (AdminLog → UI). Renders as a plain, unanimated `div` otherwise
 * — so this is always safe to wrap around existing markup with zero visual
 * change until the feature is enabled.
 */
export const Tappable = React.forwardRef<HTMLDivElement, TappableProps>(
  ({ pressScale = 0.96, children, ...props }, ref) => {
    const enabled = useMicroInteractionsEnabled();

    if (!enabled) {
      return (
        <div ref={ref} {...props}>
          {children}
        </div>
      );
    }

    return (
      <motion.div
        ref={ref}
        whileTap={{ scale: pressScale }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
Tappable.displayName = 'Tappable';
