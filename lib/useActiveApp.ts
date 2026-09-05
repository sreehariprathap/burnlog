// lib/useActiveApp.ts
'use client';

import { useSyncExternalStore } from 'react';
import { getActiveApp, type AppId } from '@/lib/appMode';

/** The active app lives in localStorage, which React can't subscribe to.
 * setAppTheme() stamps <html data-app> on every switch, so watching that
 * attribute is the one signal that reliably fires for all apps — including
 * the three with no theme class of their own. */
function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-app'],
  });
  return () => observer.disconnect();
}

/** Reactive counterpart to getActiveApp() — re-renders on app switch.
 * Use this anywhere a per-app setting is resolved during render; the
 * CSS-variable effects can keep using getActiveApp() directly since they
 * already run inside their own MutationObserver. */
export function useActiveApp(): AppId {
  return useSyncExternalStore(
    subscribe,
    getActiveApp,
    // Server render has no localStorage; 'logbook' matches getActiveApp()'s
    // own fallback, so the first client render agrees with the server.
    () => 'logbook' as AppId
  );
}
