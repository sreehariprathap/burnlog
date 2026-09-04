'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const liquidButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
  {
    variants: {
      variant: {
        default: 'text-foreground',
        primary: 'text-primary',
        destructive: 'text-destructive',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-4 text-xs has-[>svg]:px-4',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        xl: 'h-12 rounded-md px-8 has-[>svg]:px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface LiquidButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof liquidButtonVariants> {
  asChild?: boolean;
}

/**
 * Frosted-glass button. `backdrop-blur` + a translucent fill is the
 * always-on base (Baseline widely available, so every browser gets a real
 * glass look) — the SVG turbulence/displacement layer on top is a
 * progressive enhancement only. Safari in particular ignores
 * `backdrop-filter: url(#id)` entirely, so without the blur base it would
 * render as a plain, un-glassy transparent button there.
 */
export const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const filterId = React.useId();
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn('relative isolate', liquidButtonVariants({ variant, size, className }))}
        {...props}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-[inherit] border border-white/25 bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_1px_3px_rgba(0,0,0,0.15)] backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_1px_3px_rgba(0,0,0,0.4)]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
          style={{ backdropFilter: `url(#${filterId})`, WebkitBackdropFilter: `url(#${filterId})` }}
        />
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
        <LiquidGlassFilter id={filterId} />
      </Comp>
    );
  }
);
LiquidButton.displayName = 'LiquidButton';

function LiquidGlassFilter({ id }: { id: string }) {
  return (
    <svg className="absolute h-0 w-0" aria-hidden="true">
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves={1} seed={1} result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation={2} result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale={70}
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation={4} />
        </filter>
      </defs>
    </svg>
  );
}
