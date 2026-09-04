// lib/appSwitchContext.tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPS, AppId, getActiveApp, setActiveApp, wipeAppStorage } from '@/lib/appMode';
import { APP_SWITCH_STEP_DURATION_MS, APP_SWITCH_TOTAL_STEPS } from '@/lib/appSwitchLoadingStates';

interface AppSwitchContextValue {
  switchingTo: AppId | null;
  switchTo: (target: AppId, path?: string) => void;
}

const AppSwitchContext = createContext<AppSwitchContextValue>({
  switchingTo: null,
  switchTo: () => {},
});

// Matches SwitchLoader's multi-step loader so it isn't cut off mid-animation.
const MIN_VISIBLE_MS = APP_SWITCH_STEP_DURATION_MS * APP_SWITCH_TOTAL_STEPS;

export function AppSwitchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [switchingTo, setSwitchingTo] = useState<AppId | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchTo = useCallback(
    (target: AppId, path?: string) => {
      const current = getActiveApp();
      if (current === target) return;

      setSwitchingTo(target);
      wipeAppStorage(current);
      setActiveApp(target);
      // replace, not push: switching apps wipes the app you're leaving's
      // local storage above, so if this were a push, hitting back from the
      // new app would land back on a page that expects state which no
      // longer exists — the "config failure"/leak between apps. Replacing
      // means back skips over the cross-app transition entirely, landing
      // wherever you were before you entered the app you just left, while
      // ordinary navigation *within* the target app (which doesn't call
      // switchTo) still pushes normally, so back works as expected there.
      router.replace(path ?? APPS[target].home);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSwitchingTo(null), MIN_VISIBLE_MS);
    },
    [router]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <AppSwitchContext.Provider value={{ switchingTo, switchTo }}>
      {children}
    </AppSwitchContext.Provider>
  );
}

export function useAppSwitch() {
  return useContext(AppSwitchContext);
}
