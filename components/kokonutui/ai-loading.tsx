// components/kokonutui/ai-loading.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import SiriOrb from "@/components/smoothui/siri-orb";

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

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4 py-8">
      {/* Padded so the orb's blurred glow has room to fade instead of hitting a hard edge. */}
      <div className="flex h-32 w-32 items-center justify-center overflow-visible">
        <SiriOrb state="thinking" size="96px" />
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
