// lib/useCurrentProfile.ts
'use client';

import useSWR, { mutate } from 'swr';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const CURRENT_PROFILE_KEY = 'current-profile';

// Loose shape — `profiles` has ~30 columns across every app and callers only
// read a handful each; a full row is fetched once and shared, so this stays
// an index signature rather than an exhaustive interface that drifts from
// the schema.
export interface CurrentProfile {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  [key: string]: unknown;
}

async function fetchCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = createClientComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('*').eq('userId', user.id).single();
  return (profile as CurrentProfile) ?? null;
}

/**
 * Single shared fetch of `auth.getUser()` + the caller's `profiles` row,
 * deduped and cached across every component that calls this hook — replaces
 * the getUser()-then-profile-select boilerplate that used to run
 * independently on every page mount.
 */
export function useCurrentProfile() {
  const { data, error, isLoading } = useSWR(CURRENT_PROFILE_KEY, fetchCurrentProfile, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  return {
    profile: data ?? null,
    loading: isLoading,
    error,
  };
}

/** Call after writing to `profiles` (streak updates, username changes, etc.) so every consumer picks up the change. */
export function refreshCurrentProfile() {
  return mutate(CURRENT_PROFILE_KEY);
}
