// components/kokonutui/motion-carousel.tsx
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "motion/react";

type MotionCarouselProps = {
  slides: React.ReactNode[];
  /** Externally-controlled active slide index. Omit for uncontrolled use. */
  selectedIndex?: number;
  /** Fires whenever the active slide changes, from either a swipe or an external selectedIndex change. */
  onSelect?: (index: number) => void;
};

export function MotionCarousel({ slides, selectedIndex: controlledIndex, onSelect: onSelectProp }: MotionCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "center" });
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = controlledIndex ?? internalIndex;

  // All slides sit side-by-side in one flex row so Embla can snap-scroll
  // between them; a plain flex row's height is always the tallest sibling's,
  // regardless of align-items. That's invisible when every slide is the same
  // shape (BurnLog's uniform charts) but leaves a large dead gap when they
  // aren't (MoneyLog's short stat-grid Overview slide next to tall chart
  // slides). Measuring the active slide and animating the row to exactly
  // that height — clipped by the viewport's overflow-hidden — is Embla's own
  // documented pattern for variable-height slides.
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeHeight, setActiveHeight] = useState<number | undefined>(undefined);

  const measureActive = useCallback(() => {
    const node = slideRefs.current[activeIndex];
    if (node) setActiveHeight(node.offsetHeight);
  }, [activeIndex]);

  useLayoutEffect(() => {
    measureActive();
  }, [measureActive, slides]);

  useEffect(() => {
    const node = slideRefs.current[activeIndex];
    if (!node) return;
    const observer = new ResizeObserver(measureActive);
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeIndex, measureActive]);

  const handleEmblaSelect = useCallback(() => {
    if (!emblaApi) return;
    const index = emblaApi.selectedScrollSnap();
    setInternalIndex(index);
    onSelectProp?.(index);
  }, [emblaApi, onSelectProp]);

  useEffect(() => {
    if (!emblaApi) return;
    handleEmblaSelect();
    emblaApi.on("select", handleEmblaSelect);
    return () => {
      emblaApi.off("select", handleEmblaSelect);
    };
  }, [emblaApi, handleEmblaSelect]);

  // Drive embla when the controlled selectedIndex prop changes externally
  // (e.g. a tab was tapped), without fighting embla's own "select" events.
  useEffect(() => {
    if (!emblaApi || controlledIndex === undefined) return;
    if (emblaApi.selectedScrollSnap() !== controlledIndex) {
      emblaApi.scrollTo(controlledIndex);
    }
  }, [emblaApi, controlledIndex]);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden" ref={emblaRef}>
        <motion.div
          className="flex items-start"
          animate={activeHeight !== undefined ? { height: activeHeight } : undefined}
          transition={{ duration: 0.3 }}
        >
          {slides.map((slide, index) => (
            <motion.div
              key={index}
              ref={(el) => {
                slideRefs.current[index] = el;
              }}
              className="min-w-0 shrink-0 grow-0 basis-full self-start px-1"
              animate={{ scale: index === activeIndex ? 1 : 0.94, opacity: index === activeIndex ? 1 : 0.7 }}
              transition={{ duration: 0.3 }}
            >
              {slide}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
