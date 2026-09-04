'use client';

import { useFeatureToggle } from '@/lib/useFeatureToggle';
import type { AppId } from '@/lib/appMode';

export const ANIMATED_APP_ICONS_TOGGLE_KEY = 'feature:animated-app-icons';

/** Admin-controlled (AdminLog → UI → App Icons) global switch between
 * animated Lucide icons and plain letter badges for every app's icon. Off
 * by default until an admin turns it on. Logbook keeps its own brand mark
 * when off, and gets an animated book icon (like every other app) when on. */
export function useAnimatedAppIconsEnabled(): boolean {
  return useFeatureToggle(ANIMATED_APP_ICONS_TOGGLE_KEY);
}

/** Letter badge shown per sub-app when animated icons are off. SocialLog/
 * ShoppingLog and TaskLog/TravelLog share an initial, so those four get a
 * two-letter badge instead of colliding on a single capital letter. */
export const APP_ICON_LETTERS: Partial<Record<AppId, string>> = {
  burnlog: 'B',
  moneylog: 'M',
  tasklog: 'Tk',
  homelog: 'H',
  sociallog: 'Sc',
  shoppinglog: 'Sh',
  travellog: 'Tr',
  learnlog: 'L',
  adminlog: 'A',
  intellog: 'I',
};
