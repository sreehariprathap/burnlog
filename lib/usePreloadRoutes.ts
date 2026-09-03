// lib/usePreloadRoutes.ts
'use client';

import { useEffect } from 'react';
import { preload } from 'swr';
import type { Key } from 'swr/_internal';

export type PreloadableQuery = {
  key: Key;
  fetcher: () => Promise<unknown>;
};

/**
 * Warms the SWR cache for a set of queries on browser idle time, so
 * navigating to a page that calls `useSWR` with the same key/fetcher pair
 * (from the same registry entry — see lib/<app>/queries.ts) renders from
 * cache instead of showing a loading state. Runs on idle rather than on
 * mount so it never competes with the current page's own first paint.
 *
 * `requestIdleCallback` isn't available in Safari, so this falls back to a
 * short `setTimeout` — this app is PWA/mobile-first, so that fallback path
 * matters in practice, not just in theory.
 */
export function usePreloadRoutes(queries: PreloadableQuery[]) {
  useEffect(() => {
    if (queries.length === 0) return;

    const run = () => {
      for (const query of queries) {
        preload(query.key, query.fetcher);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(id);
    }

    const id = window.setTimeout(run, 200);
    return () => window.clearTimeout(id);
  }, [queries]);
}
