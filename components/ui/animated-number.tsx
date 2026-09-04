'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotionValue, useSpring, useMotionValueEvent } from 'motion/react';
import { useMicroInteractionsEnabled } from '@/lib/microInteractions';

export interface AnimatedNumberProps {
  value: number;
  /** Defaults to a rounded, thousands-separated integer. */
  format?: (n: number) => string;
  className?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

/**
 * Springs a displayed number from its previous value to `value` whenever
 * it changes — e.g. XP, streaks, calorie totals, a day score — instead of
 * snapping straight to it. Only when Micro Interactions is on; otherwise
 * (and always on first mount, either way) it jumps straight to `value`, so
 * nothing counts up from an arbitrary starting point on page load, only on
 * a real change while the page is open.
 */
export function AnimatedNumber({ value, format = defaultFormat, className }: AnimatedNumberProps) {
  const enabled = useMicroInteractionsEnabled();
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 300, damping: 30 });
  const [display, setDisplay] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      motionValue.jump(value);
      setDisplay(value);
      return;
    }
    if (enabled) {
      motionValue.set(value);
    } else {
      motionValue.jump(value);
      setDisplay(value);
    }
  }, [value, enabled, motionValue]);

  useMotionValueEvent(spring, 'change', (latest) => {
    // The spring still runs its own passive animation toward whatever
    // motionValue.jump() (in the disabled branch above) set it to — jump()
    // doesn't stop dependents from animating, only the source value
    // itself. Ignore those intermediate frames while disabled so the
    // display doesn't visibly count anyway.
    if (enabled) setDisplay(latest);
  });

  return <span className={className}>{format(display)}</span>;
}
