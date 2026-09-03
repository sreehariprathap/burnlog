'use client';

import { motion } from 'motion/react';
import { memo, useMemo } from 'react';

interface Point {
  x: number;
  y: number;
}

interface PathData {
  id: string;
  d: string;
  opacity: number;
  width: number;
}

function generateAestheticPath(
  index: number,
  position: number,
  type: 'primary' | 'secondary' | 'accent'
): string {
  const baseAmplitude = type === 'primary' ? 150 : type === 'secondary' ? 100 : 60;
  const phase = index * 0.2;
  const points: Point[] = [];
  const segments = type === 'primary' ? 10 : type === 'secondary' ? 8 : 6;

  const startX = 2400;
  const startY = 800;
  const endX = -2400;
  const endY = -800 + index * 25;

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const eased = 1 - (1 - progress) ** 2;

    const baseX = startX + (endX - startX) * eased;
    const baseY = startY + (endY - startY) * eased;

    const amplitudeFactor = 1 - eased * 0.3;
    const wave1 = Math.sin(progress * Math.PI * 3 + phase) * (baseAmplitude * 0.7 * amplitudeFactor);
    const wave2 = Math.cos(progress * Math.PI * 4 + phase) * (baseAmplitude * 0.3 * amplitudeFactor);
    const wave3 = Math.sin(progress * Math.PI * 2 + phase) * (baseAmplitude * 0.2 * amplitudeFactor);

    points.push({
      x: baseX * position,
      y: baseY + wave1 + wave2 + wave3,
    });
  }

  return points
    .map((point, i) => {
      if (i === 0) return `M ${point.x} ${point.y}`;
      const prev = points[i - 1];
      const tension = 0.4;
      const cp1x = prev.x + (point.x - prev.x) * tension;
      const cp1y = prev.y;
      const cp2x = prev.x + (point.x - prev.x) * (1 - tension);
      const cp2y = point.y;
      return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${point.x} ${point.y}`;
    })
    .join(' ');
}

const generateUniqueId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 11)}`;

const FloatingPaths = memo(function FloatingPaths({ position }: { position: number }) {
  const primaryPaths: PathData[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: generateUniqueId('primary'),
        d: generateAestheticPath(i, position, 'primary'),
        opacity: 0.15 + i * 0.02,
        width: 4 + i * 0.3,
      })),
    [position]
  );

  const secondaryPaths: PathData[] = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        id: generateUniqueId('secondary'),
        d: generateAestheticPath(i, position, 'secondary'),
        opacity: 0.12 + i * 0.015,
        width: 3 + i * 0.25,
      })),
    [position]
  );

  const accentPaths: PathData[] = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: generateUniqueId('accent'),
        d: generateAestheticPath(i, position, 'accent'),
        opacity: 0.08 + i * 0.12,
        width: 2 + i * 0.2,
      })),
    [position]
  );

  const sharedAnimationProps = { opacity: 1, scale: 1 };
  const sharedTransition = { opacity: { duration: 1 }, scale: { duration: 1 } };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="h-full w-full"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        viewBox="-2400 -800 4800 1600"
      >
        <title>Background paths</title>
        <defs>
          <linearGradient id="auroraPathGradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#f6a63f" />
            <stop offset="25%" stopColor="#17b47a" />
            <stop offset="50%" stopColor="#4a95f0" />
            <stop offset="75%" stopColor="#e8447b" />
            <stop offset="100%" stopColor="#8b5fe8" />
          </linearGradient>
        </defs>

        <g className="primary-waves">
          {primaryPaths.map((path) => (
            <motion.path
              animate={{ ...sharedAnimationProps, y: [0, -15, 0] }}
              d={path.d}
              initial={{ opacity: 0, scale: 0.8 }}
              key={path.id}
              stroke="url(#auroraPathGradient)"
              strokeLinecap="round"
              strokeWidth={path.width}
              style={{ opacity: path.opacity }}
              transition={{
                ...sharedTransition,
                y: { duration: 8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', repeatType: 'reverse' },
              }}
            />
          ))}
        </g>

        <g className="secondary-waves" style={{ opacity: 0.8 }}>
          {secondaryPaths.map((path) => (
            <motion.path
              animate={{ ...sharedAnimationProps, y: [0, -10, 0] }}
              d={path.d}
              initial={{ opacity: 0, scale: 0.9 }}
              key={path.id}
              stroke="url(#auroraPathGradient)"
              strokeLinecap="round"
              strokeWidth={path.width}
              style={{ opacity: path.opacity }}
              transition={{
                ...sharedTransition,
                y: { duration: 6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', repeatType: 'reverse' },
              }}
            />
          ))}
        </g>

        <g className="accent-waves" style={{ opacity: 0.6 }}>
          {accentPaths.map((path) => (
            <motion.path
              animate={{ ...sharedAnimationProps, y: [0, -5, 0] }}
              d={path.d}
              initial={{ opacity: 0, scale: 0.95 }}
              key={path.id}
              stroke="url(#auroraPathGradient)"
              strokeLinecap="round"
              strokeWidth={path.width}
              style={{ opacity: path.opacity }}
              transition={{
                ...sharedTransition,
                y: { duration: 4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', repeatType: 'reverse' },
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
});

type BackgroundPathsProps = {
  /** overall opacity of the whole background layer, 0-1 */
  opacity?: number;
  className?: string;
};

export const BackgroundPaths = memo(function BackgroundPaths({
  opacity = 0.3,
  className,
}: BackgroundPathsProps) {
  return (
    <div className={className} style={{ opacity }}>
      <FloatingPaths position={1} />
    </div>
  );
});
