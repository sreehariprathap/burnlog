// components/ui/multi-step-loader.tsx
// Local adaptation of https://ui.aceternity.com/components/multi-step-loader,
// re-themed onto our own design tokens (bg-background/text-primary/etc.)
// instead of the original's hardcoded dark palette, and built on `motion`
// (already a dependency here) instead of framer-motion.
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingState {
  text: string;
}

function LoaderCore({
  loadingStates,
  currentState,
}: {
  loadingStates: LoadingState[];
  currentState: number;
}) {
  return (
    <div className="flex relative justify-start max-w-xl mx-auto flex-col gap-2">
      {loadingStates.map((state, index) => {
        const distance = Math.abs(index - currentState);
        const opacity = Math.max(1 - distance * 0.2, 0);

        return (
          <motion.div
            key={index}
            className="text-left flex gap-2 items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity }}
            transition={{ duration: 0.4 }}
          >
            <div>
              {index > currentState && <Circle className="text-muted-foreground" size={18} />}
              {index <= currentState && <CheckCircle2 className="text-primary" size={18} />}
            </div>
            <span
              className={cn(
                'text-sm',
                currentState === index ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}
            >
              {state.text}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

interface MultiStepLoaderProps {
  loadingStates: LoadingState[];
  loading: boolean;
  duration?: number;
  loop?: boolean;
  /** Optional visual rendered above the checklist, e.g. an app-specific mark. */
  icon?: React.ReactNode;
}

export function MultiStepLoader({
  loadingStates,
  loading,
  duration = 550,
  loop = false,
  icon,
}: MultiStepLoaderProps) {
  const [currentState, setCurrentState] = useState(0);

  useEffect(() => {
    if (!loading) {
      setCurrentState(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentState((prev) => {
        if (prev === loadingStates.length - 1) {
          if (loop) return 0;
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, duration);

    return () => clearInterval(interval);
  }, [loading, loadingStates.length, duration, loop]);

  return (
    <AnimatePresence mode="wait">
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="w-full h-full fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-background/90"
        >
          <div className="flex flex-col items-center gap-10">
            {icon && <div>{icon}</div>}
            <div className="relative">
              <LoaderCore loadingStates={loadingStates} currentState={currentState} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
