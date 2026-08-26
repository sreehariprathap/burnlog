'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_COLORS = ['#FF9E4F', '#F97316', '#EF4444', '#B55233'];
const DEFAULT_BACKGROUND_FILL = '#FFF7ED';

type WavyBackgroundProps = {
  className?: string;
  colors?: string[];
  backgroundFill?: string;
};

export function WavyBackground({ className, colors = DEFAULT_COLORS, backgroundFill = DEFAULT_BACKGROUND_FILL }: WavyBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = canvas.width = canvas.offsetWidth * dpr;
      height = canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, width, height);

      colors.forEach((color, i) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 3 * dpr;
        const amplitude = 40 * dpr;
        const wavelength = 220 * dpr;
        const yOffset = height * (0.3 + i * 0.15);
        for (let x = 0; x <= width; x += 6) {
          const y = yOffset + Math.sin(x / wavelength + t + i) * amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      t += 0.01;
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [colors, backgroundFill]);

  return <canvas ref={canvasRef} className={className} />;
}
