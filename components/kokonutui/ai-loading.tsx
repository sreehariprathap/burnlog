// components/kokonutui/ai-loading.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const RING_COLORS = [
  "var(--primary)", "var(--chart-2)", "var(--success)",
  "var(--chart-3)", "var(--warning)", "var(--chart-4)",
];

const DEFAULT_TASKS = [
  "Reviewing your profile",
  "Analyzing your preferences",
  "Generating recommendations",
  "Finalizing details",
];

export function AiLoading({ tasks = DEFAULT_TASKS }: { tasks?: string[] }) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPaused(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setVisibleIndex((i) => (i + 1) % tasks.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [paused, tasks.length]);

  const progress = ((visibleIndex + 1) / tasks.length) * 100;

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4 py-8">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {RING_COLORS.map((color, i) => {
            const r = 46 - i * 6;
            const circumference = 2 * Math.PI * r;
            const offset = circumference * (1 - progress / 100);
            return (
              <circle
                key={color}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                opacity={0.85}
                style={{ stroke: color, transition: "stroke-dashoffset 0.6s ease" }}
              />
            );
          })}
        </svg>
      </div>

      <div className="w-full max-w-xs overflow-hidden rounded-md border bg-muted/30 font-mono text-xs">
        {tasks.slice(0, visibleIndex + 1).slice(-5).map((task, i) => (
          <div
            key={task + i}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 transition-opacity",
              i === Math.min(visibleIndex, 4) ? "opacity-100" : "opacity-50"
            )}
          >
            <span className="text-muted-foreground">{String(visibleIndex - Math.min(visibleIndex, 4) + i + 1).padStart(2, "0")}</span>
            <span>{task}…</span>
          </div>
        ))}
      </div>
    </div>
  );
}
