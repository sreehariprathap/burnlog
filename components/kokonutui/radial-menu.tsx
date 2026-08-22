// components/kokonutui/radial-menu.tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type RadialMenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

type RadialMenuProps = {
  open: boolean;
  items: RadialMenuItem[];
  onClose: () => void;
  /** Orbit radius in px. Defaults to a value that fits comfortably on a phone screen. */
  radius?: number;
};

export function RadialMenu({ open, items, onClose, radius = 110 }: RadialMenuProps) {
  // Arrange items across a quarter-circle arc, purely left-and-up from the
  // trigger (never rightward) — the FAB sits at the screen's right edge, so any
  // angle past 270° would push items further right and off-screen.
  const arcStart = 180; // degrees (directly left)
  const arcEnd = 270; // degrees (directly up)
  const step = items.length > 1 ? (arcEnd - arcStart) / (items.length - 1) : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {items.map((item, index) => {
            const angleDeg = arcStart + step * index;
            const angleRad = (angleDeg * Math.PI) / 180;
            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;

            return (
              <motion.button
                key={item.key}
                className={cn(
                  "fixed z-50 flex h-14 w-14 flex-col items-center justify-center rounded-full",
                  "border border-white/10 bg-background/60 text-foreground shadow-lg backdrop-blur-md"
                )}
                style={{ bottom: `calc(5.5rem - ${y}px)`, right: `calc(1rem - ${x}px)` }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: "spring", stiffness: 300, damping: 22, delay: index * 0.03 }}
                onClick={() => {
                  item.onSelect();
                }}
                aria-label={item.label}
              >
                {item.icon}
                <span className="mt-0.5 text-[9px] leading-none">{item.label}</span>
              </motion.button>
            );
          })}
        </>
      )}
    </AnimatePresence>
  );
}
