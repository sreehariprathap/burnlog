// components/kokonutui/glass-filter.tsx
"use client";

export function GlassFilter({ id, scale = 30 }: { id: string; scale?: number }) {
  const filterId = `glass-distortion-${id}`;

  return (
    <svg className="absolute h-0 w-0" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="2"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred1" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred1"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
    </svg>
  );
}
