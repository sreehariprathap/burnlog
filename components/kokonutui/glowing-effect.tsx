// components/kokonutui/glowing-effect.tsx
"use client";

import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

function GlowingEffectComponent({
  blur = 0,
  inactiveZone = 0.7,
  proximity = 0,
  spread = 20,
  variant = "default",
  glow = false,
  className,
  disabled = true,
  movementDuration = 2,
  borderWidth = 1,
}: GlowingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef(0);

  useEffect(() => {
    if (disabled) return;
    const element = containerRef.current;
    if (!element) return;

    const handlePointerMove = (e: PointerEvent) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const distanceFromCenter = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

      const withinProximity =
        e.clientX > left - proximity &&
        e.clientX < left + width + proximity &&
        e.clientY > top - proximity &&
        e.clientY < top + height + proximity;

      if (distanceFromCenter < inactiveRadius || !withinProximity) {
        element.style.setProperty("--active", "0");
        return;
      }

      element.style.setProperty("--active", "1");

      const targetAngle =
        (180 * Math.atan2(e.clientY - centerY, e.clientX - centerX)) / Math.PI + 90;
      // Shortest angular path so the transition never spins the long way around.
      const delta = (((targetAngle - lastAngleRef.current + 180) % 360) + 360) % 360 - 180;
      const newAngle = lastAngleRef.current + delta;
      lastAngleRef.current = newAngle;
      element.style.setProperty("--start", `${newAngle}deg`);
      // --start is registered with `inherits: false` (required for the CSS
      // transition to animate smoothly), so it must also be set directly on
      // the descendant that reads it in its ::after mask-image, or the angle
      // would stay frozen at the initial 0deg.
      glowRef.current?.style.setProperty("--start", `${newAngle}deg`);
    };

    document.body.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => document.body.removeEventListener("pointermove", handlePointerMove);
  }, [disabled, inactiveZone, proximity]);

  const gradient =
    variant === "white"
      ? "repeating-conic-gradient(from 236.84deg at 50% 50%, var(--foreground), var(--foreground) calc(25% / var(--repeating-conic-gradient-times)))"
      : `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%),
         radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%),
         radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%),
         radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%),
         repeating-conic-gradient(
           from 236.84deg at 50% 50%,
           #dd7bbb 0%,
           #d79f1e calc(25% / var(--repeating-conic-gradient-times)),
           #5a922c calc(50% / var(--repeating-conic-gradient-times)),
           #4c7894 calc(75% / var(--repeating-conic-gradient-times)),
           #dd7bbb calc(100% / var(--repeating-conic-gradient-times))
         )`;

  if (disabled) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={
        {
          "--spread": spread,
          "--start": "0deg",
          "--active": "0",
          "--glowingeffect-border-width": `${borderWidth}px`,
          "--repeating-conic-gradient-times": "5",
          "--gradient": gradient,
          "--movement-duration": `${movementDuration}s`,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
        } as React.CSSProperties
      }
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
    >
      <div ref={glowRef} className={cn("glowing-effect-glow", glow && "glow")} />
    </div>
  );
}

export const GlowingEffect = memo(GlowingEffectComponent);
