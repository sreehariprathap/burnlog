'use client';

import { motion, useReducedMotion } from 'motion/react';
import { MessageCircle } from 'lucide-react';

interface ChatEmptyIllustrationProps {
  title: string;
  subtitle: string;
}

const bubbleVariants = {
  animate: (i: number) => ({
    y: [0, -6, 0],
    transition: {
      duration: 2.4,
      repeat: Infinity,
      ease: 'easeInOut' as const,
      delay: i * 0.25,
    },
  }),
};

/**
 * Decorative empty-state illustration for SocialLog messaging — a small set
 * of gently floating chat bubbles. Used only where there's nothing to show
 * yet (no threads, or a thread with no messages); never in place of real
 * message bubbles. Built from this app's theme tokens so it matches both
 * light and dark mode without hardcoded colors.
 */
export function ChatEmptyIllustration({ title, subtitle }: ChatEmptyIllustrationProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="relative flex h-24 w-32 items-center justify-center">
        <motion.div
          custom={0}
          variants={bubbleVariants}
          animate={reduceMotion ? undefined : 'animate'}
          className="absolute left-0 top-2 flex h-10 w-16 items-center justify-center rounded-2xl rounded-bl-sm bg-muted shadow-sm"
        >
          <span className="h-1.5 w-8 rounded-full bg-muted-foreground/30" />
        </motion.div>
        <motion.div
          custom={1}
          variants={bubbleVariants}
          animate={reduceMotion ? undefined : 'animate'}
          className="absolute right-0 top-8 flex h-10 w-14 items-center justify-center rounded-2xl rounded-br-sm bg-primary/15 shadow-sm"
        >
          <span className="h-1.5 w-7 rounded-full bg-primary/40" />
        </motion.div>
        <motion.div
          custom={2}
          variants={bubbleVariants}
          animate={reduceMotion ? undefined : 'animate'}
          className="absolute bottom-0 left-4 flex h-9 w-12 items-center justify-center rounded-2xl rounded-bl-sm bg-muted shadow-sm"
        >
          <MessageCircle className="size-4 text-muted-foreground/60" />
        </motion.div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
