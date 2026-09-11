"use client";

import { useEffect } from 'react';

/**
 * Silently applies service-worker updates as soon as they're installed —
 * no "update available" prompt. Reloads once the new worker takes control.
 */
export default function PWAAutoUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const activate = (worker: ServiceWorker | null) => {
      worker?.postMessage({ type: 'SKIP_WAITING' });
    };

    navigator.serviceWorker.ready.then((registration) => {
      // A worker may already be waiting from before this component mounted.
      if (registration.waiting) activate(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            activate(newWorker);
          }
        });
      });
    });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
