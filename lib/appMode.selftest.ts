// lib/appMode.selftest.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export {};

class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, val: string) {
    this.store.set(key, val);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

(global as any).window = { localStorage: new FakeStorage() };

async function main() {
  const {
    nsKey,
    nsGet,
    nsSet,
    nsRemove,
    getDefaultApp,
    setDefaultApp,
    getActiveApp,
    setActiveApp,
    wipeAppStorage,
    DEFAULT_APP_KEY,
    ACTIVE_APP_KEY,
  } = await import('./appMode');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  // nsKey / nsSet / nsGet / nsRemove
  assert(nsKey('burnlog', 'foo') === 'burnlog:foo', 'nsKey composes app:key');
  nsSet('burnlog', 'foo', 'bar');
  assert(nsGet('burnlog', 'foo') === 'bar', 'nsGet reads what nsSet wrote');
  nsRemove('burnlog', 'foo');
  assert(nsGet('burnlog', 'foo') === null, 'nsRemove deletes the key');

  // getDefaultApp fallback + set
  assert(getDefaultApp() === 'burnlog', 'getDefaultApp falls back to burnlog when unset');
  setDefaultApp('lifelog');
  assert(getDefaultApp() === 'lifelog', 'setDefaultApp persists');
  assert((window as any).localStorage.getItem(DEFAULT_APP_KEY) === 'lifelog', 'default app key is app:defaultApp');

  // getActiveApp fallback + set
  assert(getActiveApp() === 'burnlog', 'getActiveApp falls back to burnlog when unset');
  setActiveApp('lifelog');
  assert(getActiveApp() === 'lifelog', 'setActiveApp persists');
  assert((window as any).localStorage.getItem(ACTIVE_APP_KEY) === 'lifelog', 'active app key is app:activeApp');

  // wipeAppStorage safety
  nsSet('burnlog', 'streak', '5');
  nsSet('burnlog', 'draftEntry', 'x');
  nsSet('lifelog', 'budget', '100');
  setDefaultApp('lifelog');
  setActiveApp('burnlog');
  (window as any).localStorage.setItem('sb-auth-token', 'secret');
  (window as any).localStorage.setItem('burnlog-theme', 'dark');

  wipeAppStorage('burnlog');

  assert(nsGet('burnlog', 'streak') === null, 'wipeAppStorage removes burnlog:streak');
  assert(nsGet('burnlog', 'draftEntry') === null, 'wipeAppStorage removes burnlog:draftEntry');
  assert(nsGet('lifelog', 'budget') === '100', 'wipeAppStorage does not touch lifelog namespace');
  assert(getDefaultApp() === 'lifelog', 'wipeAppStorage does not touch app:defaultApp');
  assert(getActiveApp() === 'burnlog', 'wipeAppStorage does not touch app:activeApp');
  assert((window as any).localStorage.getItem('sb-auth-token') === 'secret', 'wipeAppStorage does not touch sb- auth keys');
  assert((window as any).localStorage.getItem('burnlog-theme') === 'dark', 'wipeAppStorage does not touch the theme key');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll appMode assertions passed');
}

main();
