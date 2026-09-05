// components/logbook/GreetingBanner.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface GreetingBannerProps {
  name?: string | null;
}

// Greeting fades out on its own partway through the 5-10s window the design
// asked for — VISIBLE_MS is when the fade-out starts, FADE_OUT_MS how long
// it takes, so the banner is fully gone by VISIBLE_MS + FADE_OUT_MS.
const VISIBLE_MS = 7000;
const FADE_OUT_MS = 600;

/**
 * One-time "Hello, {name}!" greeting shown at the top of the LogBook hub —
 * moved here from BurnLog's dashboard since LogBook is the actual front
 * door post-login. Fades in, then fades itself out after a few seconds so
 * it doesn't permanently take up space above the daily digest.
 */
export function GreetingBanner({ name }: GreetingBannerProps) {
  const [visible, setVisible] = useState(true);
  const shouldReduceMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), VISIBLE_MS);
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : FADE_OUT_MS / 1000, ease: 'easeInOut' }}
          onHoverStart={pauseTimer}
          onHoverEnd={startTimer}
          onFocus={pauseTimer}
          onBlur={startTimer}
        >
          <h2 className="text-2xl font-bold">Hello, {name || 'there'}!</h2>
          <p className="text-muted-foreground">Here&apos;s your day, across every log.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
