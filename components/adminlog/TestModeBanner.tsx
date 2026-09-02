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
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-black"
      style={{ paddingTop: 'env(safe-area-inset-top, 0.5rem)' }}
    >
      <FlaskConical className="w-4 h-4" aria-hidden="true" />
      TEST MODE — running as the onboarding test account
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="ml-2 rounded-md bg-black/10 px-2 py-0.5 font-semibold hover:bg-black/20 disabled:opacity-50"
      >
        Exit Test Mode
      </button>
    </div>
  );
}

export default TestModeBanner;
