// components/ui/world-map.tsx
'use client';

import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import DottedMap from 'dotted-map';

import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

/** Projects lat/lng onto this component's fixed 800x400 world canvas —
 * exported so callers (e.g. a per-country mini-map) can compute a cropped
 * `viewBox` from a set of points without duplicating this formula. */
export function projectPoint(lat: number, lng: number): { x: number; y: number } {
  const x = (lng + 180) * (800 / 360);
  const y = (90 - lat) * (400 / 180);
  return { x, y };
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function parseViewBox(viewBox: string): ViewBox {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  return { x, y, w, h };
}

interface MapProps {
  /** Flight paths — rendered as a solid line. */
  dots?: Array<{ start: MapPoint; end: MapPoint }>;
  /** Road-trip paths (e.g. a spoke from home base to a day-trip destination)
   * — rendered dashed, in a second color, so they read as visually distinct
   * from flights rather than implying one continuous route. */
  roadDots?: Array<{ start: MapPoint; end: MapPoint }>;
  hotspots?: MapPoint[];
  /** The viewer's current location — rendered as a distinct pulsing "You are
   * here" marker regardless of any logged visit. */
  currentLocation?: MapPoint;
  lineColor?: string;
  roadLineColor?: string;
  currentLocationColor?: string;
  className?: string;
  /** Crops the 800x400 world canvas to a region, e.g. "100 50 200 150" — use
   * to zoom a mini-map to one country. Defaults to the full world. */
  viewBox?: string;
  /** Enables scroll/pinch-to-zoom and drag-to-pan on top of `viewBox`.
   * Off by default so small, non-interactive mini-maps (e.g. per-country
   * cards in a grid) don't fight the page's own scrolling. */
  interactive?: boolean;
}

export default function WorldMap({
  dots = [],
  roadDots = [],
  hotspots = [],
  currentLocation,
  lineColor = 'var(--primary)',
  roadLineColor = 'var(--muted-foreground)',
  currentLocationColor = 'var(--info)',
  className,
  viewBox = '0 0 800 400',
  interactive = false,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const map = new DottedMap({ height: 100, grid: 'diagonal' });

  const baseViewBox = useMemo(() => parseViewBox(viewBox), [viewBox]);
  const [vb, setVb] = useState<ViewBox>(baseViewBox);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const pinchState = useRef<{ startDist: number; startVb: ViewBox } | null>(null);

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

  const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  // Clamp so you can zoom in up to 8x but never past the world/country
  // bounds this map was cropped to (zooming "out" beyond the starting crop
  // would just show empty canvas).
  function clampViewBox(next: ViewBox): ViewBox {
    const minW = baseViewBox.w / 8;
    const minH = baseViewBox.h / 8;
    const w = Math.min(baseViewBox.w, Math.max(minW, next.w));
    const h = Math.min(baseViewBox.h, Math.max(minH, next.h));
    const maxX = baseViewBox.x + baseViewBox.w - w;
    const maxY = baseViewBox.y + baseViewBox.h - h;
    const x = Math.min(maxX, Math.max(baseViewBox.x, next.x));
    const y = Math.min(maxY, Math.max(baseViewBox.y, next.y));
    return { x, y, w, h };
  }

  function clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const fracX = (clientX - rect.left) / rect.width;
    const fracY = (clientY - rect.top) / rect.height;
    return { x: vb.x + fracX * vb.w, y: vb.y + fracY * vb.h };
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const point = clientToSvgPoint(clientX, clientY);
    if (!point) return;
    setVb((prev) => {
      const w = prev.w * factor;
      const h = prev.h * factor;
      // Keep the point under the cursor/pinch-center fixed in place.
      const x = point.x - (point.x - prev.x) * (w / prev.w);
      const y = point.y - (point.y - prev.y) * (h / prev.h);
      return clampViewBox({ x, y, w, h });
    });
  }

  function handleWheel(e: React.WheelEvent) {
    if (!interactive) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!interactive || !dragState.current || dragState.current.pointerId !== e.pointerId) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = ((e.clientX - dragState.current.lastX) / rect.width) * vb.w;
    const dy = ((e.clientY - dragState.current.lastY) / rect.height) * vb.h;
    dragState.current.lastX = e.clientX;
    dragState.current.lastY = e.clientY;
    setVb((prev) => clampViewBox({ ...prev, x: prev.x - dx, y: prev.y - dy }));
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (dragState.current?.pointerId === e.pointerId) dragState.current = null;
  }

  function touchDistance(touches: React.TouchList): number {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (!interactive || e.touches.length !== 2) return;
    pinchState.current = { startDist: touchDistance(e.touches), startVb: vb };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!interactive || !pinchState.current || e.touches.length !== 2) return;
    e.preventDefault();
    const { startDist, startVb } = pinchState.current;
    const dist = touchDistance(e.touches);
    const factor = startDist / dist;
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const point = clientToSvgPoint(midX, midY);
    if (!point) return;
    const w = startVb.w * factor;
    const h = startVb.h * factor;
    const x = point.x - (point.x - startVb.x) * (w / startVb.w);
    const y = point.y - (point.y - startVb.y) * (h / startVb.h);
    setVb(clampViewBox({ x, y, w, h }));
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchState.current = null;
  }

  function handleDoubleClick() {
    if (!interactive) return;
    setVb(baseViewBox);
  }

  const activeViewBox = interactive ? vb : baseViewBox;
  // Marker radii/stroke/font sizes are tuned for the full 800-wide world
  // view — on a tightly-cropped mini-map (or zoomed-in interactive view)
  // they'd otherwise stay those same absolute sizes and look comically
  // oversized, since the viewBox is doing all the "zooming". Scale them
  // down proportionally to how zoomed-in the current view is.
  const scale = activeViewBox.w / 800;

  return (
    <div
      ref={containerRef}
      className={cn(
        'w-full aspect-[2/1] dark:bg-black bg-white rounded-lg relative font-sans overflow-hidden',
        interactive && 'touch-none',
        className
      )}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        viewBox={`${activeViewBox.x} ${activeViewBox.y} ${activeViewBox.w} ${activeViewBox.h}`}
        className={cn('w-full h-full absolute inset-0 select-none', !interactive && 'pointer-events-none')}
      >
        <defs>
          <linearGradient id="world-map-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="10%" stopColor="white" stopOpacity="1" />
            <stop offset="90%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="world-map-fade-mask">
            <rect x="0" y="0" width="800" height="400" fill="url(#world-map-fade)" />
          </mask>
        </defs>
        {/* Rendered inside the SVG (not a plain <img>) so it shares the same
            viewBox as everything else and crops/zooms in perfect sync. */}
        <image
          href={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
          x="0"
          y="0"
          width="800"
          height="400"
          preserveAspectRatio="none"
          mask="url(#world-map-fade-mask)"
        />
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <g key={`path-group-${i}`}>
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                fill="none"
                stroke="url(#path-gradient)"
                strokeWidth={scale}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.5 * i, ease: 'easeOut' }}
              />
            </g>
          );
        })}

        {roadDots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <motion.path
              key={`road-path-${i}`}
              d={createCurvedPath(startPoint, endPoint)}
              fill="none"
              stroke={roadLineColor}
              strokeWidth={scale}
              strokeDasharray={`${3 * scale} ${3 * scale}`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: 0.5 * i, ease: 'easeOut' }}
            />
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
              <circle cx={projectPoint(dot.start.lat, dot.start.lng).x} cy={projectPoint(dot.start.lat, dot.start.lng).y} r={2 * scale} fill={lineColor} />
              <circle cx={projectPoint(dot.start.lat, dot.start.lng).x} cy={projectPoint(dot.start.lat, dot.start.lng).y} r={2 * scale} fill={lineColor} opacity="0.5">
                <animate attributeName="r" from={2 * scale} to={8 * scale} dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
            <g key={`end-${i}`}>
              <circle cx={projectPoint(dot.end.lat, dot.end.lng).x} cy={projectPoint(dot.end.lat, dot.end.lng).y} r={2 * scale} fill={lineColor} />
              <circle cx={projectPoint(dot.end.lat, dot.end.lng).x} cy={projectPoint(dot.end.lat, dot.end.lng).y} r={2 * scale} fill={lineColor} opacity="0.5">
                <animate attributeName="r" from={2 * scale} to={8 * scale} dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>
        ))}

        {hotspots.map((point, i) => {
          const { x, y } = projectPoint(point.lat, point.lng);
          return (
            <g key={`hotspot-${i}`}>
              <circle cx={x} cy={y} r={5 * scale} fill={lineColor} stroke="white" strokeWidth={1.5 * scale} />
              <circle cx={x} cy={y} r={5 * scale} fill={lineColor} opacity="0.5">
                <animate attributeName="r" from={5 * scale} to={16 * scale} dur="1.8s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" begin="0s" repeatCount="indefinite" />
              </circle>
              {point.label && (
                <text x={x} y={y - 10 * scale} textAnchor="middle" fontSize={8 * scale} fill={lineColor} className="font-medium">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}

        {currentLocation && (() => {
          const { x, y } = projectPoint(currentLocation.lat, currentLocation.lng);
          return (
            <g key="current-location">
              <circle cx={x} cy={y} r={5 * scale} fill={currentLocationColor} stroke="white" strokeWidth={1.5 * scale} />
              <circle cx={x} cy={y} r={5 * scale} fill={currentLocationColor} opacity="0.6">
                <animate attributeName="r" from={5 * scale} to={20 * scale} dur="1.6s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="1.6s" begin="0s" repeatCount="indefinite" />
              </circle>
              <text x={x} y={y - 10 * scale} textAnchor="middle" fontSize={8 * scale} fill={currentLocationColor} className="font-semibold">
                {currentLocation.label ?? 'You are here'}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
