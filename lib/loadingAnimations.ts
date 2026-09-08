// lib/loadingAnimations.ts
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import type { AppId } from '@/lib/appMode';

export type AppLoadingAnimationSrc =
  | { src: string; kind: 'lottie' }
  | { src: null; kind: 'siri_orb' }
  | null;

async function fetchLoadingAnimations(): Promise<Partial<Record<AppId, AppLoadingAnimationSrc>>> {
  const res = await apiFetch('/api/loading-animations');
  if (!res.ok) return {};
  const body = await res.json();
  return body.animations ?? {};
}

// Cached globally under SWRConfig (see app/RootLayoutClient.tsx). Assignment
// changes are rare (an admin action), so a long dedupe window and no
// focus-revalidation avoid re-fetching on every app-switch.
export function useAppSwitchLottie(): Partial<Record<AppId, AppLoadingAnimationSrc>> {
  const { data } = useSWR('app-switch-loading-animations', fetchLoadingAnimations, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60 * 1000,
  });
  return data ?? {};
}
