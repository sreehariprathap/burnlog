"use client";

import { memo, useMemo } from "react";
import { motion } from "motion/react";

const BRAND_COLORS = ["#F97316", "#FBBF24", "#EF4444"];

function generatePaths(count: number, amplitude: number) {
  return Array.from({ length: count }, (_, i) => {
    const seed = i / count;
    const yBase = 40 + seed * 300;
    const wave = Math.sin(seed * Math.PI * 2) * amplitude;
    return {
      id: i,
      d: `M-100 ${yBase} Q 400 ${yBase + wave}, 900 ${yBase} T 1900 ${yBase}`,
      color: BRAND_COLORS[i % BRAND_COLORS.length],
    };
  });
}

function BackgroundPathsInner({ className }: { className?: string }) {
  const primary = useMemo(() => generatePaths(12, 60), []);
  const secondary = useMemo(() => generatePaths(15, 40), []);
  const accent = useMemo(() => generatePaths(10, 25), []);

  const groups = [
    { paths: primary, width: 4, duration: 25 },
    { paths: secondary, width: 3, duration: 20 },
    { paths: accent, width: 2, duration: 15 },
  ];

  return (
    <svg
      className={className}
      viewBox="0 0 1600 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="background-paths-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={BRAND_COLORS[0]} stopOpacity={0.5} />
          <stop offset="50%" stopColor={BRAND_COLORS[1]} stopOpacity={0.4} />
          <stop offset="100%" stopColor={BRAND_COLORS[2]} stopOpacity={0.5} />
        </linearGradient>
      </defs>
      {groups.map((group, gi) =>
        group.paths.map((path, pi) => (
          <motion.path
            key={`${gi}-${path.id}`}
            d={path.d}
            stroke="url(#background-paths-gradient)"
            strokeWidth={group.width}
            fill="none"
            initial={{ y: 0, opacity: 0.3 }}
            animate={{ y: [-15 + pi, -5 - pi, -15 + pi], opacity: [0.3, 0.6, 0.3] }}
            transition={{
              duration: group.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: pi * 0.2,
            }}
          />
        ))
      )}
    </svg>
  );
}

export const BackgroundPaths = memo(BackgroundPathsInner);
