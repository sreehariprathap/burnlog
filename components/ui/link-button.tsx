// components/ui/link-button.tsx
// Adapted from AlignUI's LinkButton (https://www.alignui.com/docs/v1.2/ui/link-button)
// — same variant/size shape and underline-on-hover interaction, rebuilt on
// this project's own cva + theme tokens instead of AlignUI's
// tailwind-variants + polymorphic-children utilities (which this project
// doesn't have).
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const linkButtonVariants = cva(
  [
    'group inline-flex items-center justify-center gap-1 whitespace-nowrap outline-none',
    'transition duration-200 ease-out',
    'underline decoration-transparent underline-offset-[3px]',
    'hover:decoration-current',
    'focus-visible:underline',
    'disabled:pointer-events-none disabled:text-muted-foreground/50 disabled:no-underline',
  ],
  {
    variants: {
      variant: {
        gray: 'text-muted-foreground focus-visible:text-foreground',
        black: 'text-foreground',
        primary: 'text-primary hover:text-primary/80',
        error: 'text-destructive hover:text-destructive/80',
      },
      size: {
        medium: 'h-5 text-sm',
        small: 'h-4 text-xs',
      },
      underline: {
        true: 'decoration-current',
      },
    },
    defaultVariants: {
      variant: 'gray',
      size: 'medium',
    },
  }
);

export interface LinkButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof linkButtonVariants> {
  asChild?: boolean;
}

export const LinkButton = React.forwardRef<HTMLButtonElement, LinkButtonProps>(
  ({ asChild, variant, size, underline, className, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        className={cn(linkButtonVariants({ variant, size, underline }), className)}
        {...props}
      />
    );
  }
);
LinkButton.displayName = 'LinkButton';

export function LinkButtonIcon({ className, size = 'medium', ...props }: React.HTMLAttributes<HTMLSpanElement> & { size?: 'medium' | 'small' }) {
  return <span className={cn('shrink-0', size === 'small' ? 'size-4' : 'size-5', className)} {...props} />;
}
