// components/kokonutui/fireworks-background.tsx
"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
};

type Firework = {
  x: number;
  y: number;
  targetY: number;
  vy: number;
  color: string;
  exploded: boolean;
  particles: Particle[];
};

const BRAND_COLORS = ["#F97316", "#FBBF24", "#EF4444", "#FF9E4F"];

export function FireworksBackground({
  color = BRAND_COLORS,
  population = 3,
}: {
  color?: string[];
  population?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const fireworks: Firework[] = [];
    let frameId: number;
    let spawnTimer = 0;

    function spawnFirework() {
      const c = color[Math.floor(Math.random() * color.length)];
      fireworks.push({
        x: Math.random() * width,
        y: height,
        targetY: height * 0.2 + Math.random() * height * 0.3,
        vy: -(6 + Math.random() * 3),
        color: c,
        exploded: false,
        particles: [],
      });
    }

    function explode(fw: Firework) {
      const count = 40;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 2 + Math.random() * 4;
        fw.particles.push({
          x: fw.x,
          y: fw.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: fw.color,
          life: 1,
        });
      }
    }

    function tick() {
      if (!ctx) return;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, width, height);

      spawnTimer++;
      if (spawnTimer > 40 / population) {
        spawnFirework();
        spawnTimer = 0;
      }

      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        if (!fw.exploded) {
          fw.y += fw.vy;
          ctx.beginPath();
          ctx.arc(fw.x, fw.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = fw.color;
          ctx.fill();
          if (fw.y <= fw.targetY) {
            fw.exploded = true;
            explode(fw);
          }
        } else {
          let alive = false;
          for (const p of fw.particles) {
            if (p.life <= 0) continue;
            alive = true;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.life -= 0.02;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(p.life, 0);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (!alive) fireworks.splice(i, 1);
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [color, population]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
