// components/kokonutui/liquid-button.tsx
"use client";

import * as React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { GlassFilter } from "@/components/kokonutui/glass-filter";
import { cn } from "@/lib/utils";

type LiquidButtonProps = React.ComponentProps<typeof Button> & {
  liquidVariant?: "default" | "none";
};

export function LiquidButton({
  className,
  liquidVariant = "default",
  style,
  children,
  ...props
}: LiquidButtonProps) {
  const id = useId();

  return (
    <span className="relative inline-block">
      {liquidVariant === "default" && (
        <>
          <GlassFilter id={id} scale={70} />
          {/* Decorative layer only — the displacement filter distorts this,
              never the Button's own text/icon content. */}
          <span
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{ filter: `url(#glass-distortion-${id})`, boxShadow: "var(--glass-shadow)" }}
            aria-hidden="true"
          />
        </>
      )}
      <Button
        className={cn(
          "relative border border-white/10 bg-background/30 backdrop-blur-[2px]",
          liquidVariant === "default" &&
            "transition-transform duration-200 active:scale-[0.97] hover:scale-105",
          className
        )}
        style={{
          ...(liquidVariant === "default" ? { boxShadow: "var(--glass-shadow)" } : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </Button>
    </span>
  );
}
