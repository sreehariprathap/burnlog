// lib/microInteractions.ts
'use client';

import { useFeatureToggle } from '@/lib/useFeatureToggle';

export const MICRO_INTERACTIONS_TOGGLE_KEY = 'feature:micro-interactions';

/** Admin-controlled (AdminLog → UI & Themes → Micro Interactions) global
 * switch for the app's opt-in animation primitives (Tappable, StaggerGrid).
 * Off by default until an admin turns it on. */
export function useMicroInteractionsEnabled(): boolean {
  return useFeatureToggle(MICRO_INTERACTIONS_TOGGLE_KEY);
}
