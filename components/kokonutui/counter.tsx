'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CounterProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string | ((value: number) => string);
  className?: string;
}

/**
 * Standalone +/- stepper split out of kokonutui's team-selector so it can be
 * reused anywhere a numeric quantity is needed (see people-stack.tsx for the
 * avatar half of that original component).
 */
export function Counter({ value, onChange, min = 0, max = Infinity, step = 1, label, className }: CounterProps) {
  const shouldReduceMotion = useReducedMotion();
  const [shake, setShake] = useState<'min' | 'max' | null>(null);

  const atMin = value <= min;
  const atMax = value >= max;

  function bump(direction: 'min' | 'max') {
    if (shouldReduceMotion) return;
    setShake(direction);
    window.setTimeout(() => setShake(null), 280);
  }

  function decrement() {
    if (atMin) return bump('min');
    onChange(Math.max(min, value - step));
  }

  function increment() {
    if (atMax) return bump('max');
    onChange(Math.min(max, value + step));
  }

  const labelText = typeof label === 'function' ? label(value) : label;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <motion.div
        animate={shake === 'min' ? { x: [0, -4, 4, -4, 0] } : {}}
        transition={{ duration: 0.28 }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={decrement}
          disabled={atMin}
          aria-label="Decrease"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </motion.div>

      <div className="flex min-w-[2ch] flex-col items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={shouldReduceMotion ? false : { y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { y: -8, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="text-2xl font-bold tabular-nums"
          >
            {value}
          </motion.span>
        </AnimatePresence>
        {labelText && <span className="text-xs text-muted-foreground">{labelText}</span>}
      </div>

      <motion.div
        animate={shake === 'max' ? { x: [0, 4, -4, 4, 0] } : {}}
        transition={{ duration: 0.28 }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={increment}
          disabled={atMax}
          aria-label="Increase"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </motion.div>
    </div>
  );
}
