// lib/appMode.ts
export type AppId = 'logbook' | 'burnlog' | 'moneylog' | 'tasklog' | 'homelog' | 'sociallog' | 'shoppinglog';

export interface AppMeta {
  id: AppId;
  name: string;
  tagline: string;
  home: string;
  themeClass?: string;
}

export const APPS: Record<AppId, AppMeta> = {
  logbook: {
    id: 'logbook',
    name: 'Logbook',
    tagline: 'Your day, across every log',
    home: '/logbook',
    themeClass: 'app-logbook',
  },
  burnlog: {
    id: 'burnlog',
    name: 'BurnLog',
    tagline: 'Track workouts & fitness goals',
    home: '/dashboard',
  },
  moneylog: {
    id: 'moneylog',
    name: 'MoneyLog',
    tagline: 'Track expenses & budgets',
    home: '/moneylog',
    themeClass: 'app-moneylog',
  },
  tasklog: {
    id: 'tasklog',
    name: 'TaskLog',
    tagline: 'Plan, track, and crush your goals',
    home: '/tasklog',
    themeClass: 'app-tasklog',
  },
  homelog: {
    id: 'homelog',
    name: 'HomeLog',
    tagline: 'Run your household together',
    home: '/homelog',
    themeClass: 'app-homelog',
  },
  sociallog: {
    id: 'sociallog',
    name: 'SocialLog',
    tagline: 'Share, follow, and connect',
    home: '/sociallog',
    themeClass: 'app-sociallog',
  },
  shoppinglog: {
    id: 'shoppinglog',
    name: 'ShoppingLog',
    tagline: 'Buy and sell, new or used',
    home: '/shoppinglog',
    themeClass: 'app-shoppinglog',
  },
};

const PROTECTED_PREFIX = 'app:';
export const DEFAULT_APP_KEY = 'app:defaultApp';
export const ACTIVE_APP_KEY = 'app:activeApp';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isAppId(val: string | null): val is AppId {
  return (
    val === 'logbook' ||
    val === 'burnlog' ||
    val === 'moneylog' ||
    val === 'tasklog' ||
    val === 'homelog' ||
    val === 'sociallog' ||
    val === 'shoppinglog'
  );
}

function safeGet(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, val: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, val);
  } catch {
    // storage disabled/unavailable — no-op
  }
}

function safeRemove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage disabled/unavailable — no-op
  }
}

export function nsKey(app: AppId, key: string): string {
  return `${app}:${key}`;
}

export function nsGet(app: AppId, key: string): string | null {
  return safeGet(nsKey(app, key));
}

export function nsSet(app: AppId, key: string, val: string): void {
  safeSet(nsKey(app, key), val);
}

export function nsRemove(app: AppId, key: string): void {
  safeRemove(nsKey(app, key));
}

export function getDefaultApp(): AppId {
  const val = safeGet(DEFAULT_APP_KEY);
  return isAppId(val) ? val : 'logbook';
}

export function setDefaultApp(app: AppId): void {
  safeSet(DEFAULT_APP_KEY, app);
}

export function getActiveApp(): AppId {
  const val = safeGet(ACTIVE_APP_KEY);
  return isAppId(val) ? val : 'logbook';
}

export function setActiveApp(app: AppId): void {
  safeSet(ACTIVE_APP_KEY, app);
}

export function wipeAppStorage(app: AppId): void {
  if (!isBrowser()) return;
  const prefix = nsKey(app, '');
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix) && !k.startsWith(PROTECTED_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // storage disabled/unavailable — no-op
  }
}
