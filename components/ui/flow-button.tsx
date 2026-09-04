'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface FlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Back-compat alias for children — pass either. */
  text?: string;
}

/**
 * Pill button whose border/arrows fill in with a solid circle on hover.
 * Uses theme tokens (not the original's hardcoded #111111/white) so it
 * follows dark mode like the rest of the app.
 */
export const FlowButton = React.forwardRef<HTMLButtonElement, FlowButtonProps>(
  ({ text, children, className, ...props }, ref) => {
    const label = children ?? text ?? 'Button';
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'group relative flex cursor-pointer items-center gap-1 overflow-hidden rounded-[100px] border-[1.5px] border-foreground/40 bg-transparent px-8 py-3 text-sm font-semibold text-foreground transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:rounded-xl hover:border-transparent hover:text-background active:scale-[0.95]',
          className
        )}
        {...props}
      >
        <ArrowRight
          aria-hidden="true"
          className="absolute left-[-25%] z-[9] size-4 stroke-foreground transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:left-4 group-hover:stroke-background"
        />
        <span className="relative z-[1] -translate-x-3 transition-all duration-[800ms] ease-out group-hover:translate-x-3">
          {label}
        </span>
        <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground opacity-0 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:size-[220px] group-hover:opacity-100" />
        <ArrowRight
          aria-hidden="true"
          className="absolute right-4 z-[9] size-4 stroke-foreground transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:right-[-25%] group-hover:stroke-background"
        />
      </button>
    );
  }
);
FlowButton.displayName = 'FlowButton';
