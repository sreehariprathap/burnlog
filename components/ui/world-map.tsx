// components/ui/world-map.tsx
'use client';

import { useRef } from 'react';
import { motion } from 'motion/react';
import DottedMap from 'dotted-map';

import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';

interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

interface MapProps {
  dots?: Array<{ start: MapPoint; end: MapPoint }>;
  hotspots?: MapPoint[];
  lineColor?: string;
  className?: string;
}

export default function WorldMap({ dots = [], hotspots = [], lineColor = 'var(--primary)', className }: MapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const map = new DottedMap({ height: 100, grid: 'diagonal' });

  const { theme } = useTheme();
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const svgMap = map.getSVG({
    radius: 0.22,
    color: isDark ? '#FFFFFF40' : '#00000040',
    shape: 'circle',
    backgroundColor: isDark ? 'black' : 'white',
  });

  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  return (
    <div className={cn('w-full aspect-[2/1] dark:bg-black bg-white rounded-lg relative font-sans', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URI, not an optimizable asset */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="h-full w-full [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)] pointer-events-none select-none"
        alt="world map"
        height="495"
        width="1056"
        draggable={false}
      />
      <svg ref={svgRef} viewBox="0 0 800 400" className="w-full h-full absolute inset-0 pointer-events-none select-none">
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <g key={`path-group-${i}`}>
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                fill="none"
                stroke="url(#path-gradient)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.5 * i, ease: 'easeOut' }}
              />
            </g>
          );
        })}

        <defs>
          <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="95%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {dots.map((dot, i) => (
          <g key={`points-group-${i}`}>
            <g key={`start-${i}`}>
              <circle cx={projectPoint(dot.start.lat, dot.start.lng).x} cy={projectPoint(dot.start.lat, dot.start.lng).y} r="2" fill={lineColor} />
              <circle cx={projectPoint(dot.start.lat, dot.start.lng).x} cy={projectPoint(dot.start.lat, dot.start.lng).y} r="2" fill={lineColor} opacity="0.5">
                <animate attributeName="r" from="2" to="8" dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
            <g key={`end-${i}`}>
              <circle cx={projectPoint(dot.end.lat, dot.end.lng).x} cy={projectPoint(dot.end.lat, dot.end.lng).y} r="2" fill={lineColor} />
              <circle cx={projectPoint(dot.end.lat, dot.end.lng).x} cy={projectPoint(dot.end.lat, dot.end.lng).y} r="2" fill={lineColor} opacity="0.5">
                <animate attributeName="r" from="2" to="8" dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>
        ))}

        {hotspots.map((point, i) => {
          const { x, y } = projectPoint(point.lat, point.lng);
          return (
            <g key={`hotspot-${i}`}>
              <circle cx={x} cy={y} r="5" fill={lineColor} stroke="white" strokeWidth="1.5" />
              <circle cx={x} cy={y} r="5" fill={lineColor} opacity="0.5">
                <animate attributeName="r" from="5" to="16" dur="1.8s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" begin="0s" repeatCount="indefinite" />
              </circle>
              {point.label && (
                <text x={x} y={y - 10} textAnchor="middle" fontSize="8" fill={lineColor} className="font-medium">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
