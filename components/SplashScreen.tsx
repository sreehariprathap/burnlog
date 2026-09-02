'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { KineticText } from '@/components/ui/kinetic-text';
import FlowField from '@/components/kokonutui/flow-field';
import { cn } from '@/lib/utils';
import { getDefaultApp, type AppId } from '@/lib/appMode';

const SESSION_KEY = 'app-splash-shown';
const VISIBLE_MS = 2000;
const FADE_MS = 600;

const SPLASH_LIGHT_BG = '249, 249, 249'; // #f9f9f9 — matches the app-wide unified light background
const SPLASH_DARK_BG = '34, 34, 59'; // #22223b — matches the app-wide unified dark background

/** Derives a hue (0-360) from a hex color so FlowField's particles can be
 * tinted to each app's own accent color instead of a fixed preset palette. */
function hexToHue(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

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
  }
> = {
  logbook: {
    label: 'Loading Logbook',
    text: 'logbook',
    tagline: 'Your day, across every log',
    darkTextColor: '#A5B4FC',
    lightTextColor: '#3730A3',
    darkTaglineClass: 'text-indigo-200/70',
    lightTaglineClass: 'text-indigo-900/60',
  },
  burnlog: {
    label: 'Loading burnlog',
    text: 'burnlog',
    tagline: 'Track the burn',
    darkTextColor: '#FF9E4F',
    lightTextColor: '#B5471B',
    darkTaglineClass: 'text-amber-200/70',
    lightTaglineClass: 'text-amber-900/60',
  },
  moneylog: {
    label: 'Loading MoneyLog',
    text: 'moneylog',
    tagline: 'Track expenses & budgets',
    darkTextColor: '#34D399',
    lightTextColor: '#065F46',
    darkTaglineClass: 'text-emerald-200/70',
    lightTaglineClass: 'text-emerald-900/60',
  },
  tasklog: {
    label: 'Loading TaskLog',
    text: 'tasklog',
    tagline: 'Plan, track, and crush your goals',
    darkTextColor: '#60A5FA',
    lightTextColor: '#1E40AF',
    darkTaglineClass: 'text-blue-200/70',
    lightTaglineClass: 'text-blue-900/60',
  },
  homelog: {
    label: 'Loading HomeLog',
    text: 'homelog',
    tagline: 'Run your household together',
    darkTextColor: '#C4B5FD',
    lightTextColor: '#6D28D9',
    darkTaglineClass: 'text-violet-200/60',
    lightTaglineClass: 'text-violet-900/50',
  },
  sociallog: {
    label: 'Loading SocialLog',
    text: 'sociallog',
    tagline: 'Share, follow, and connect',
    darkTextColor: '#F472B6',
    lightTextColor: '#9D174D',
    darkTaglineClass: 'text-pink-200/70',
    lightTaglineClass: 'text-pink-900/60',
  },
  shoppinglog: {
    label: 'Loading ShoppingLog',
    text: 'shoppinglog',
    tagline: 'Buy and sell, new or used',
    darkTextColor: '#FDBA74',
    lightTextColor: '#9A3412',
    darkTaglineClass: 'text-orange-200/70',
    lightTaglineClass: 'text-orange-900/60',
  },
  travellog: {
    label: 'Loading TravelLog',
    text: 'travellog',
    tagline: "Track everywhere you've been",
    darkTextColor: '#FBBF24',
    lightTextColor: '#92400E',
    darkTaglineClass: 'text-amber-200/70',
    lightTaglineClass: 'text-amber-900/60',
  },
  learnlog: {
    label: 'Loading LearnLog',
    text: 'learnlog',
    tagline: "Track what you're learning, becoming, and growing into",
    darkTextColor: '#C4B5FD',
    lightTextColor: '#5B21B6',
    darkTaglineClass: 'text-violet-200/70',
    lightTaglineClass: 'text-violet-900/60',
  },
};

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [appId, setAppId] = useState<AppId>('logbook');

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
  const hue = hexToHue(isDark ? content.darkTextColor : content.lightTextColor);

  return (
    <div
      role="status"
      aria-label={content.label}
      className="fixed inset-0 z-[100] overflow-hidden transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      <FlowField
        className="h-full min-h-0 w-full"
        backgroundFill={isDark ? SPLASH_DARK_BG : SPLASH_LIGHT_BG}
        hueStart={hue}
        hueRange={60}
        saturation={85}
        lightness={isDark ? 62 : 45}
      >
        <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
          {appId === 'logbook' ? (
            <Image
              src="/icons/logbook-light.png"
              alt="The LogBook"
              width={1146}
              height={348}
              priority
              className="h-auto w-[min(80vw,420px)] select-none"
            />
          ) : (
            <KineticText
              text={content.text}
              className={cn(
                'justify-center text-[clamp(2.75rem,14vw,6rem)] leading-none tracking-tight select-none',
              )}
              style={{ color: isDark ? content.darkTextColor : content.lightTextColor }}
            />
          )}
          <p
            className={cn(
              'mt-4 text-sm font-medium tracking-[0.3em] uppercase',
              isDark ? content.darkTaglineClass : content.lightTaglineClass
            )}
          >
            {content.tagline}
          </p>
        </div>
      </FlowField>
    </div>
  );
}
