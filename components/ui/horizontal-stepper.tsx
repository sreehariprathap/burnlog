// components/ui/horizontal-stepper.tsx
// Adapted from AlignUI's HorizontalStepper
// (https://www.alignui.com/docs/v1.2/ui/horizontal-stepper) — same
// completed/active/default indicator states and chevron-separated layout,
// rebuilt on this project's own tokens + lucide-react instead of AlignUI's
// tailwind-variants/polymorphic utils and @remixicon/react.
import { Fragment } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepState = 'completed' | 'active' | 'default';

export interface HorizontalStepperStep {
  label: string;
  state: StepState;
}

export function HorizontalStepper({ steps, className }: { steps: HorizontalStepperStep[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2', className)}>
      {steps.map((step, i) => (
        <Fragment key={step.label}>
          <div
            className={cn(
              'flex items-center gap-2 text-sm',
              step.state === 'default' ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                step.state === 'completed' && 'bg-success text-white',
                step.state === 'active' && 'bg-primary text-primary-foreground',
                step.state === 'default' && 'text-muted-foreground ring-1 ring-inset ring-border'
              )}
            >
              {step.state === 'completed' ? <Check className="size-3" /> : i + 1}
            </span>
            {step.label}
          </div>
          {i < steps.length - 1 && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />}
        </Fragment>
      ))}
    </div>
  );
}
