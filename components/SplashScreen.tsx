'use client';

import { useEffect, useState } from 'react';
import { KineticText } from '@/components/ui/kinetic-text';

const SESSION_KEY = 'burnlog-splash-shown';
const VISIBLE_MS = 2000;
const FADE_MS = 600;

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Only show once per browser session (first load)
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    sessionStorage.setItem(SESSION_KEY, '1');
    setMounted(true);

    const leaveTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    const removeTimer = setTimeout(() => setMounted(false), VISIBLE_MS + FADE_MS);

    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-label="Loading burnlog"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#1a0f0a] transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      {/* fire glow backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 45%, rgba(255,158,79,0.35), transparent 70%), radial-gradient(50% 40% at 50% 60%, rgba(255,61,113,0.30), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
        <KineticText
          text="burnlog"
          className="justify-center text-[clamp(2.75rem,14vw,6rem)] leading-none tracking-tight text-[#FF9E4F] select-none"
        />
        <p className="mt-4 text-sm font-medium tracking-[0.3em] uppercase text-amber-200/70">
          Track the burn
        </p>
      </div>
    </div>
  );
}
