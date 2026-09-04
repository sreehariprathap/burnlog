'use client';

import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { LiquidButton } from '@/components/ui/liquid-button';
import { FlowButton } from '@/components/ui/flow-button';
import { MetalButton } from '@/components/ui/metal-button';
import { useButtonTheme } from '@/lib/useButtonTheme';

export interface ThemedButtonProps extends ButtonProps {
  /** Which BUTTON_SLOTS entry this button renders as — set in
   * AdminLog → Button Theme. */
  slot: string;
}

/** Renders as whichever button style the admin has assigned to `slot`
 * (default/liquid/flow/metal), falling back to the plain themed Button
 * until the setting loads. Existing call sites are unaffected unless they
 * opt in by switching to this component. */
export function ThemedButton({ slot, variant, size, className, children, ...props }: ThemedButtonProps) {
  const style = useButtonTheme(slot);

  if (style === 'liquid') {
    return (
      <LiquidButton className={className} {...props}>
        {children}
      </LiquidButton>
    );
  }
  if (style === 'flow') {
    return (
      <FlowButton className={className} {...props}>
        {children}
      </FlowButton>
    );
  }
  if (style === 'metal') {
    return (
      <MetalButton className={className} {...props}>
        {children}
      </MetalButton>
    );
  }
  return (
    <Button variant={variant} size={size} className={className} {...props}>
      {children}
    </Button>
  );
}
