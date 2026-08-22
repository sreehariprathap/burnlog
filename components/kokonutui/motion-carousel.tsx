// components/kokonutui/motion-carousel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
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
        <div className="flex">
          {slides.map((slide, index) => (
            <motion.div
              key={index}
              className="min-w-0 shrink-0 grow-0 basis-full px-1"
              animate={{ scale: index === activeIndex ? 1 : 0.94, opacity: index === activeIndex ? 1 : 0.7 }}
              transition={{ duration: 0.3 }}
            >
              {slide}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
