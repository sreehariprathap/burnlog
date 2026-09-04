// lib/useFeatureToggle.ts
'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { resolveToggle, type ToggleRow, type ToggleOverrideRow } from '@/lib/adminlog/resolveToggle';

export const TOGGLES_KEY = 'adminlog-toggles-overrides';

interface ToggleData {
  toggles: ToggleRow[];
  overridesByKey: Record<string, ToggleOverrideRow>;
}

async function fetchToggleData(profileId: string): Promise<ToggleData> {
  const supabase = createClient();
  const [togglesRes, overridesRes] = await Promise.all([
    supabase.from('adminlog_toggles').select('key, type, globallyEnabled'),
    supabase.from('adminlog_toggle_overrides').select('toggleKey, enabled').eq('profileId', profileId),
  ]);
  return {
    toggles: (togglesRes.data ?? []) as ToggleRow[],
    overridesByKey: Object.fromEntries(
      (overridesRes.data ?? []).map((o) => [o.toggleKey, { enabled: o.enabled } as ToggleOverrideRow])
    ),
  };
}

/** Whether a `feature:`/`app:` toggle (see AdminLog → Toggles) is on for the
 * current user. Shared across every consumer via one SWR-cached fetch —
 * cheap to call from many components (e.g. every Tappable instance). */
export function useFeatureToggle(key: string): boolean {
  const { profile } = useCurrentProfile();
  const { data } = useSWR(profile ? [TOGGLES_KEY, profile.id] : null, () => fetchToggleData(profile!.id), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  if (!data || !profile) return false;
  const toggle = data.toggles.find((t) => t.key === key);
  if (!toggle) return false;
  const override = data.overridesByKey[key] ?? null;
  const enabledApps = Array.isArray(profile.enabledApps) ? (profile.enabledApps as string[]) : [];
  return resolveToggle(toggle, override, { enabledApps });
}
