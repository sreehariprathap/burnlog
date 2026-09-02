// components/kokonutui/smooth-tabs.tsx
"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  color: string;
};

type SmoothTabsProps = {
  items: TabItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  className?: string;
  /** Show the tab's text label next to its icon (widens the active pill). Defaults to icon-only. */
  showLabels?: boolean;
};

export function SmoothTabs({ items, selectedIndex, onSelect, className, showLabels }: SmoothTabsProps) {
  return (
    <div className={cn("flex items-center justify-center gap-1 overflow-x-auto sm:justify-start", className)}>
      {items.map((item, index) => {
        const isActive = index === selectedIndex;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={item.label}
            aria-current={isActive}
            className={cn(
              "relative flex shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors",
              showLabels ? "p-2.5 sm:px-3 sm:py-2" : "p-2.5"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="smooth-tabs-pill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: item.color }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                "relative z-10 size-5",
                isActive ? "text-white" : "text-muted-foreground"
              )}
            />
            {showLabels && (
              <span
                className={cn(
                  "relative z-10 hidden text-sm font-medium sm:inline",
                  isActive ? "text-white" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
