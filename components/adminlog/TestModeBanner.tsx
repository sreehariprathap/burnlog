// components/adminlog/TestModeBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export const TEST_MODE_ACTIVE_KEY = 'adminlog:testModeActive';
export const STASHED_SESSION_KEY = 'adminlog:stashedSession';

export function TestModeBanner() {
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setActive(sessionStorage.getItem(TEST_MODE_ACTIVE_KEY) === '1');
  }, []);

  async function handleExit() {
    setExiting(true);
    try {
      const stashed = sessionStorage.getItem(STASHED_SESSION_KEY);
      if (stashed) {
        const { access_token, refresh_token } = JSON.parse(stashed);
        const supabase = createClient();
        await supabase.auth.setSession({ access_token, refresh_token });
      }
      sessionStorage.removeItem(TEST_MODE_ACTIVE_KEY);
      sessionStorage.removeItem(STASHED_SESSION_KEY);
      // Hard navigation: every SWR cache in the app (profile, notifications,
      // etc.) needs to start clean under the restored admin identity rather
      // than carry over state fetched while impersonating the test account.
      window.location.href = '/adminlog/test-onboarding';
    } finally {
      setExiting(false);
    }
  }

  if (!active) return null;

  return (
    <div
      role="status"
      aria-label="Test mode active — running as the onboarding test account"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-1.5 whitespace-nowrap bg-amber-500 px-3 py-0.5 text-center text-[11px] font-medium leading-tight text-black"
      style={{ paddingTop: 'env(safe-area-inset-top, 0.125rem)' }}
    >
      <FlaskConical className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">TEST MODE</span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="shrink-0 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-black/20 disabled:opacity-50"
      >
        Exit
      </button>
    </div>
  );
}

export default TestModeBanner;
