'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

type SafeDivProps = Omit<
  React.ComponentPropsWithoutRef<'div'>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
>;

/**
 * Fades+slides content in the first time it scrolls into view, when Micro
 * Interactions is on. Renders as a plain, unanimated `div` otherwise. Best
 * for longer scrolling feeds/lists (activity timelines, browse listings) —
 * for content already visible on load, use `StaggerItem` instead, which
 * animates on mount rather than on scroll.
 */
export function RevealOnScroll({ className, children, ...props }: SafeDivProps) {
  const enabled = useMicroInteractionsEnabled();

  if (!enabled) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
