// components/ui/progress.tsx
// Adapted from Animate UI (MIT) — https://animate-ui.com/r/components-radix-progress.json
// and https://animate-ui.com/r/primitives-radix-progress.json — using this
// project's already-installed @radix-ui/react-progress instead of the
// unified `radix-ui` meta-package animate-ui ships by default.
'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { motion } from 'motion/react';

import { getStrictContext } from '@/lib/getStrictContext';
import { cn } from '@/lib/utils';

type ProgressContextType = { value: number };

const [ProgressProvider, useProgress] = getStrictContext<ProgressContextType>('ProgressContext');

type ProgressPrimitiveRootProps = React.ComponentProps<typeof ProgressPrimitive.Root>;

function ProgressPrimitiveRoot(props: ProgressPrimitiveRootProps) {
  return (
    <ProgressProvider value={{ value: props.value ?? 0 }}>
      <ProgressPrimitive.Root data-slot="progress" {...props} />
    </ProgressProvider>
  );
}

const MotionProgressIndicator = motion.create(ProgressPrimitive.Indicator);

type ProgressIndicatorPrimitiveProps = React.ComponentProps<typeof MotionProgressIndicator>;

function ProgressIndicatorPrimitive({
  transition = { type: 'spring', stiffness: 100, damping: 30 },
  ...props
}: ProgressIndicatorPrimitiveProps) {
  const { value } = useProgress();

  return (
    <MotionProgressIndicator
      data-slot="progress-indicator"
      animate={{ x: `-${100 - (value || 0)}%` }}
      transition={transition}
      {...props}
    />
  );
}

type ProgressProps = ProgressPrimitiveRootProps;

function Progress({ className, children, ...props }: ProgressProps) {
  return (
    <ProgressPrimitiveRoot
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      {children ?? <ProgressIndicatorPrimitive className="bg-primary h-full w-full flex-1 rounded-full" />}
    </ProgressPrimitiveRoot>
  );
}

export { Progress, ProgressIndicatorPrimitive as ProgressIndicator, type ProgressProps };
