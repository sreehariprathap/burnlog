'use client';

import { useEffect, useState } from 'react';
import { KineticText } from '@/components/ui/kinetic-text';
import { WavyBackground } from '@/components/kokonutui/wavy-background';
import { LinesGradientShader } from '@/components/kokonutui/lines-gradient-shader';
import { cn } from '@/lib/utils';
import { getDefaultApp, type AppId } from '@/lib/appMode';

const SESSION_KEY = 'app-splash-shown';
const VISIBLE_MS = 2000;
const FADE_MS = 600;

const SPLASH_CONTENT: Record<
  AppId,
  {
    label: string;
    text: string;
    tagline: string;
    darkTextColor: string;
    lightTextColor: string;
    darkTaglineClass: string;
    lightTaglineClass: string;
    lightColors: string[];
    lightBackgroundFill: string;
    darkEdgeColor: string;
    darkCoreColor: string;
  }
> = {
  burnlog: {
    label: 'Loading burnlog',
    text: 'burnlog',
    tagline: 'Track the burn',
    darkTextColor: '#FF9E4F',
    lightTextColor: '#B5471B',
    darkTaglineClass: 'text-amber-200/70',
    lightTaglineClass: 'text-amber-900/60',
    lightColors: ['#FF9E4F', '#F97316', '#EF4444', '#B55233'],
    lightBackgroundFill: '#FFF7ED',
    darkEdgeColor: '255,158,79',
    darkCoreColor: '255,61,113',
  },
  lifelog: {
    label: 'Loading LifeLog',
    text: 'lifelog',
    tagline: 'Track expenses & budgets',
    darkTextColor: '#34D399',
    lightTextColor: '#065F46',
    darkTaglineClass: 'text-emerald-200/70',
    lightTaglineClass: 'text-emerald-900/60',
    lightColors: ['#34D399', '#10B981', '#059669', '#047857'],
    lightBackgroundFill: '#ECFDF5',
    darkEdgeColor: '52,211,153',
    darkCoreColor: '5,150,105',
  },
};

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [appId, setAppId] = useState<AppId>('burnlog');

  useEffect(() => {
    // Only show once per browser session (first load)
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const root = document.documentElement;
    setIsDark(root.classList.contains('dark'));
    setAppId(getDefaultApp());
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

  const content = SPLASH_CONTENT[appId];

  return (
    <div
      role="status"
      aria-label={content.label}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      {isDark ? (
        <LinesGradientShader
          className="pointer-events-none absolute inset-0 h-full w-full"
          edgeColor={content.darkEdgeColor}
          coreColor={content.darkCoreColor}
        />
      ) : (
        <WavyBackground
          className="pointer-events-none absolute inset-0 h-full w-full"
          colors={content.lightColors}
          backgroundFill={content.lightBackgroundFill}
        />
      )}

      <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
        <KineticText
          text={content.text}
          className={cn(
            'justify-center text-[clamp(2.75rem,14vw,6rem)] leading-none tracking-tight select-none',
          )}
          style={{ color: isDark ? content.darkTextColor : content.lightTextColor }}
        />
        <p
          className={cn(
            'mt-4 text-sm font-medium tracking-[0.3em] uppercase',
            isDark ? content.darkTaglineClass : content.lightTaglineClass
          )}
        >
          {content.tagline}
        </p>
      </div>
    </div>
  );
}
