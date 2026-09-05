'use client';

import { motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCROLL_TIMEOUT_OFFSET = 100;
const MIN_SCROLL_INTERVAL = 300;
const SCROLL_THRESHOLD = 20;
const TOUCH_SCROLL_THRESHOLD = 60;
const SCALE_FACTOR = 0.08;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1;
const CARD_HEIGHT = 220;
const CARD_PADDING = 60;
const FRAME_OFFSET = -18;
const FRAMES_VISIBLE_LENGTH = 3;
const SNAP_DISTANCE = 50;
const TRANSITION_DURATION = 220;

export interface TripCardItem {
  id: string;
  destination: string;
  country: string;
  windowLabel: string;
  reason: string;
  startDate: string;
  endDate: string;
}

const AURORA_GRADIENTS = [
  'linear-gradient(135deg, #f6a63f, #e8447b)',
  'linear-gradient(135deg, #17b47a, #4a95f0)',
  'linear-gradient(135deg, #4a95f0, #8b5fe8)',
  'linear-gradient(135deg, #e8447b, #8b5fe8)',
  'linear-gradient(135deg, #f6a63f, #17b47a)',
];

export function WeeklyTripStack({
  items,
  onSelect,
}: {
  items: TripCardItem[];
  onSelect: (item: TripCardItem) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const lastScrollTime = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  const maxIndex = items.length - 1;

  const clamp = useCallback((val: number, min: number, max: number) => Math.min(Math.max(val, min), max), []);

  const scrollToCard = useCallback(
    (direction: 1 | -1) => {
      if (isScrolling) return;
      const now = Date.now();
      if (now - lastScrollTime.current < MIN_SCROLL_INTERVAL) return;

      const newIndex = clamp(currentIndex + direction, 0, maxIndex);
      if (newIndex === currentIndex) return;

      lastScrollTime.current = now;
      setIsScrolling(true);
      setCurrentIndex(newIndex);
      scrollY.set(newIndex * SNAP_DISTANCE);
      setTimeout(() => setIsScrolling(false), TRANSITION_DURATION + SCROLL_TIMEOUT_OFFSET);
    },
    [currentIndex, maxIndex, scrollY, isScrolling, clamp]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (isDragging || isScrolling) return;
      if (Math.abs(e.deltaY) < SCROLL_THRESHOLD) return;
      e.preventDefault();
      scrollToCard(e.deltaY > 0 ? 1 : -1);
    },
    [isDragging, isScrolling, scrollToCard]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isScrolling) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToCard(-1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToCard(1);
      }
    },
    [isScrolling, scrollToCard]
  );

  const touchStartY = useRef(0);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchMoved.current = false;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || isScrolling || touchMoved.current) return;
      const deltaY = touchStartY.current - e.touches[0].clientY;
      if (Math.abs(deltaY) > TOUCH_SCROLL_THRESHOLD) {
        scrollToCard(deltaY > 0 ? 1 : -1);
        touchMoved.current = true;
      }
    },
    [isDragging, isScrolling, scrollToCard]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    touchMoved.current = false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const getCardTransform = useCallback(
    (index: number) => {
      const offsetIndex = index - currentIndex;
      const isBehindCurrent = currentIndex > index;
      const opacity = isBehindCurrent ? 0 : 1;
      const scale = shouldReduceMotion ? 1 : clamp(1 - offsetIndex * SCALE_FACTOR, MIN_SCALE, MAX_SCALE);
      const y = shouldReduceMotion ? 0 : clamp(offsetIndex * FRAME_OFFSET, FRAME_OFFSET * FRAMES_VISIBLE_LENGTH, 0);
      return { opacity, scale, y, zIndex: items.length - index };
    },
    [currentIndex, items.length, clamp, shouldReduceMotion]
  );

  if (items.length === 0) return null;

  return (
    <div
      aria-label="Weekly trip suggestions"
      className="relative mx-auto w-full max-w-sm"
      onKeyDown={handleKeyDown}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      ref={containerRef}
      role="group"
      style={{ minHeight: `${CARD_HEIGHT + CARD_PADDING}px`, touchAction: 'pan-y' }}
      tabIndex={0}
    >
      {items.map((item, i) => {
        const transform = getCardTransform(i);
        const isActive = i === currentIndex;

        return (
          <motion.button
            animate={shouldReduceMotion ? {} : { scale: transform.scale, y: transform.y }}
            aria-hidden={!isActive}
            className="absolute top-0 left-0 w-full overflow-hidden rounded-2xl border bg-card text-left shadow-lg"
            initial={false}
            key={item.id}
            onClick={() => (isActive ? onSelect(item) : scrollToCard(i > currentIndex ? 1 : -1))}
            style={{
              height: `${CARD_HEIGHT}px`,
              opacity: transform.opacity,
              pointerEvents: isActive || i > currentIndex ? 'auto' : 'none',
              zIndex: transform.zIndex,
            }}
            tabIndex={isActive ? 0 : -1}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring' as const, stiffness: 250, damping: 20, mass: 0.5 }
            }
            type="button"
          >
            <div
              className="flex h-16 items-center gap-2 px-4 text-white"
              style={{ background: AURORA_GRADIENTS[i % AURORA_GRADIENTS.length] }}
            >
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="truncate text-lg font-semibold">{item.destination}</div>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <span className="w-fit rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {item.windowLabel}
              </span>
              <p className="text-sm text-muted-foreground">{item.reason}</p>
            </div>
          </motion.button>
        );
      })}

      <div
        aria-label="Card navigation"
        className="absolute left-1/2 flex -translate-x-1/2 space-x-2"
        role="tablist"
        style={{ top: `${CARD_HEIGHT + 16}px` }}
      >
        {items.map((item, i) => (
          <button
            aria-label={`Go to card ${i + 1} of ${items.length}`}
            aria-selected={i === currentIndex}
            className={cn(
              'h-2 w-2 rounded-full transition-all',
              i === currentIndex ? 'scale-125 bg-primary' : 'bg-muted-foreground/30'
            )}
            key={item.id}
            onClick={() => scrollToCard(i > currentIndex ? 1 : -1)}
            role="tab"
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
