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

type Instance = {
  container: HTMLDivElement;
  glow: HTMLDivElement;
  inactiveZone: number;
  proximity: number;
  lastAngle: number;
};

// A single shared document-level pointermove listener serves every
// GlowingEffect instance, rAF-throttled and read/write-batched: all
// instances' getBoundingClientRect() calls happen before any style
// writes, so N cards never cause N interleaved layout reflows.
const instances = new Set<Instance>();
let pointerX = 0;
let pointerY = 0;
let rafId: number | null = null;
let listenerAttached = false;

function processFrame() {
  rafId = null;
  const rects = new Map<Instance, DOMRect>();
  for (const instance of instances) {
    rects.set(instance, instance.container.getBoundingClientRect());
  }
  for (const instance of instances) {
    const { left, top, width, height } = rects.get(instance)!;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const distanceFromCenter = Math.hypot(pointerX - centerX, pointerY - centerY);
    const inactiveRadius = 0.5 * Math.min(width, height) * instance.inactiveZone;

    const withinProximity =
      pointerX > left - instance.proximity &&
      pointerX < left + width + instance.proximity &&
      pointerY > top - instance.proximity &&
      pointerY < top + height + instance.proximity;

    if (distanceFromCenter < inactiveRadius || !withinProximity) {
      instance.container.style.setProperty("--active", "0");
      continue;
    }

    instance.container.style.setProperty("--active", "1");

    const targetAngle =
      (180 * Math.atan2(pointerY - centerY, pointerX - centerX)) / Math.PI + 90;
    // Shortest angular path so the transition never spins the long way around.
    const delta = (((targetAngle - instance.lastAngle + 180) % 360) + 360) % 360 - 180;
    const newAngle = instance.lastAngle + delta;
    instance.lastAngle = newAngle;
    instance.container.style.setProperty("--start", `${newAngle}deg`);
    // --start is registered with `inherits: false` (required for the CSS
    // transition to animate smoothly), so it must also be set directly on
    // the descendant that reads it in its ::after mask-image, or the angle
    // would stay frozen at the initial 0deg.
    instance.glow.style.setProperty("--start", `${newAngle}deg`);
  }
}

function handlePointerMove(e: PointerEvent) {
  pointerX = e.clientX;
  pointerY = e.clientY;
  if (rafId === null) {
    rafId = requestAnimationFrame(processFrame);
  }
}

function registerInstance(instance: Instance) {
  instances.add(instance);
  if (!listenerAttached) {
    document.body.addEventListener("pointermove", handlePointerMove, { passive: true });
    listenerAttached = true;
  }
}

function unregisterInstance(instance: Instance) {
  instances.delete(instance);
  if (instances.size === 0 && listenerAttached) {
    document.body.removeEventListener("pointermove", handlePointerMove);
    listenerAttached = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
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

  useEffect(() => {
    if (disabled) return;
    const container = containerRef.current;
    const glowEl = glowRef.current;
    if (!container || !glowEl) return;

    const instance: Instance = { container, glow: glowEl, inactiveZone, proximity, lastAngle: 0 };
    registerInstance(instance);
    return () => unregisterInstance(instance);
  }, [disabled, inactiveZone, proximity]);

  const gradient =
    variant === "white"
      ? "repeating-conic-gradient(from 236.84deg at 50% 50%, var(--foreground), var(--foreground) calc(25% / var(--repeating-conic-gradient-times)))"
      : `radial-gradient(circle, #ff9e4f 10%, #ff9e4f00 20%),
         radial-gradient(circle at 40% 40%, #ffbb70 5%, #ffbb7000 15%),
         radial-gradient(circle at 60% 60%, #f97316 10%, #f9731600 20%),
         radial-gradient(circle at 40% 60%, #ffd39a 10%, #ffd39a00 20%),
         repeating-conic-gradient(
           from 236.84deg at 50% 50%,
           #ff9e4f 0%,
           #ffbb70 calc(25% / var(--repeating-conic-gradient-times)),
           #f97316 calc(50% / var(--repeating-conic-gradient-times)),
           #ffd39a calc(75% / var(--repeating-conic-gradient-times)),
           #ff9e4f calc(100% / var(--repeating-conic-gradient-times))
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
