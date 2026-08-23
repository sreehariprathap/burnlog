'use client';

import { useEffect, useRef } from 'react';

export function LinesGradientShader({ className }: { className?: string }) {
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
    const LINE_COUNT = 12;

    const render = () => {
      ctx.fillStyle = '#1a0f0a';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < LINE_COUNT; i++) {
        const progress = i / LINE_COUNT;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        const shift = (t + progress) % 1;
        gradient.addColorStop(Math.max(0, shift - 0.15), 'rgba(255,158,79,0)');
        gradient.addColorStop(shift, 'rgba(255,61,113,0.8)');
        gradient.addColorStop(Math.min(1, shift + 0.15), 'rgba(255,158,79,0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        const y = height * (progress + 0.02 * Math.sin(t * 4 + i));
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      t += 0.003;
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
