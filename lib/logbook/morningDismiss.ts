// lib/logbook/morningDismiss.ts
import { nsGet, nsSet } from '@/lib/appMode';

const DISMISS_KEY = 'morningBriefDismissedDate';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isMorningBriefDismissedToday(): boolean {
  return nsGet('logbook', DISMISS_KEY) === todayKey();
}

export function dismissMorningBriefToday(): void {
  nsSet('logbook', DISMISS_KEY, todayKey());
}

export function isBeforeNoon(): boolean {
  return new Date().getHours() < 12;
}
