// lib/appMode.ts
export type AppId = 'logbook' | 'burnlog' | 'moneylog' | 'tasklog' | 'homelog' | 'sociallog' | 'shoppinglog' | 'travellog' | 'learnlog' | 'adminlog' | 'intellog' | 'watchlog';

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
    home: '/burnlog/dashboard',
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
  travellog: {
    id: 'travellog',
    name: 'TravelLog',
    tagline: "Track everywhere you've been",
    home: '/travellog',
    themeClass: 'app-travellog',
  },
  learnlog: {
    id: 'learnlog',
    name: 'LearnLog',
    tagline: "Track what you're learning, becoming, and growing into",
    home: '/learnlog',
    themeClass: 'app-learnlog',
  },
  adminlog: {
    id: 'adminlog',
    name: 'AdminLog',
    tagline: 'Manage the app, from the app',
    home: '/adminlog',
  },
  intellog: {
    id: 'intellog',
    name: 'IntelLog',
    tagline: 'Suggestions built from everything else you track',
    home: '/intellog',
  },
  watchlog: {
    id: 'watchlog',
    name: 'WatchLog',
    tagline: 'Track and discover what to watch next',
    home: '/watchlog',
    themeClass: 'app-watchlog',
  },
};

const PROTECTED_PREFIX = 'app:';
export const DEFAULT_APP_KEY = 'app:defaultApp';
export const ACTIVE_APP_KEY = 'app:activeApp';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function isAppId(val: string | null): val is AppId {
  return (
    val === 'logbook' ||
    val === 'burnlog' ||
    val === 'moneylog' ||
    val === 'tasklog' ||
    val === 'homelog' ||
    val === 'sociallog' ||
    val === 'shoppinglog' ||
    val === 'travellog' ||
    val === 'learnlog' ||
    val === 'adminlog' ||
    val === 'intellog' ||
    val === 'watchlog'
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

export const ENABLED_APPS_KEY = 'app:enabledApps';

export function getEnabledApps(): AppId[] | null {
  const val = safeGet(ENABLED_APPS_KEY);
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.filter((v): v is AppId => isAppId(v)) : null;
  } catch {
    return null;
  }
}

export function setEnabledApps(apps: AppId[]): void {
  safeSet(ENABLED_APPS_KEY, JSON.stringify(apps));
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

export function setAppTheme(app: AppId): void {
  if (!isBrowser()) return;
  const root = document.documentElement;

  // Remove all app theme classes
  Object.values(APPS).forEach((appMeta) => {
    if (appMeta.themeClass) {
      root.classList.remove(appMeta.themeClass);
    }
  });

  // Add only the target app's theme class
  const targetApp = APPS[app];
  if (targetApp.themeClass) {
    root.classList.add(targetApp.themeClass);
  }

  setActiveApp(app);
}
