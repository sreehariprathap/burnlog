'use client';

import { useEffect, useState } from 'react';
import { KineticText } from '@/components/ui/kinetic-text';
import { WavyBackground } from '@/components/kokonutui/wavy-background';
import { LinesGradientShader } from '@/components/kokonutui/lines-gradient-shader';
import { cn } from '@/lib/utils';

const SESSION_KEY = 'burnlog-splash-shown';
const VISIBLE_MS = 2000;
const FADE_MS = 600;

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Only show once per browser session (first load)
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const root = document.documentElement;
    setIsDark(root.classList.contains('dark'));
    sessionStorage.setItem(SESSION_KEY, '1');
    setMounted(true);

    // Theme providers commonly apply the dark/light class to <html> from an
    // effect (after this component's own mount effect already ran), so the
    // check above can race and read the class before it's applied. Watch for
    // that class landing shortly after mount and reconcile if it changes.
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    const leaveTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    const removeTimer = setTimeout(() => setMounted(false), VISIBLE_MS + FADE_MS);

    return () => {
      observer.disconnect();
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-label="Loading burnlog"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      {isDark ? (
        <LinesGradientShader className="pointer-events-none absolute inset-0 h-full w-full" />
      ) : (
        <WavyBackground className="pointer-events-none absolute inset-0 h-full w-full" />
      )}

      <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
        <KineticText
          text="burnlog"
          className={cn(
            'justify-center text-[clamp(2.75rem,14vw,6rem)] leading-none tracking-tight select-none',
            isDark ? 'text-[#FF9E4F]' : 'text-[#B5471B]'
          )}
        />
        <p
          className={cn(
            'mt-4 text-sm font-medium tracking-[0.3em] uppercase',
            isDark ? 'text-amber-200/70' : 'text-amber-900/60'
          )}
        >
          Track the burn
        </p>
      </div>
    </div>
  );
}
