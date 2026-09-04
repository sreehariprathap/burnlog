'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

const VISIBLE_MS = 700;

export interface SuccessPulseProps {
  /** Bump this (e.g. a counter you already increment on save/complete) to
   * trigger the pulse. Renders nothing on the value it mounts with. */
  trigger: number;
}

/**
 * A brief full-screen checkmark pop — the payoff moment for completing a
 * task, logging a workout, hitting a goal. Only when Micro Interactions is
 * on; renders nothing otherwise (the toast/refresh you already show is
 * still the real feedback — this is additive delight, not a dependency).
 */
export function SuccessPulse({ trigger }: SuccessPulseProps) {
  const enabled = useMicroInteractionsEnabled();
  const [show, setShow] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!enabled) return;
    setShow(true);
    const timeout = setTimeout(() => setShow(false), VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [trigger, enabled]);

  if (!enabled) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <CheckCircle2 className="h-20 w-20 text-primary drop-shadow-lg" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
