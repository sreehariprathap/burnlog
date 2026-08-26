// lib/homelog/useHouseholdMe.ts
'use client';

import useSWR from 'swr';

export interface HouseholdInfo {
  id: string;
  name: string;
  createdAt: string;
}

export interface MemberInfo {
  profileId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  username: string;
  firstName: string;
}

interface HouseholdMeResponse {
  household: HouseholdInfo | null;
  members: MemberInfo[];
  myRole: 'owner' | 'member' | null;
  myProfileId: string;
}

const HOUSEHOLD_ME_KEY = 'homelog-household-me';

async function fetchHouseholdMe(): Promise<HouseholdMeResponse> {
  const res = await fetch('/api/homelog/households/me');
  return res.json();
}

/**
 * Shared across every HomeLog page — without this, Home/Chores/Inventory/Bills
 * each independently re-fetched household membership on every mount.
 */
export function useHouseholdMe() {
  const { data, isLoading, mutate } = useSWR(HOUSEHOLD_ME_KEY, fetchHouseholdMe);

  return {
    household: data?.household ?? null,
    members: data?.members ?? [],
    myRole: data?.myRole ?? null,
    myProfileId: data?.myProfileId ?? null,
    isLoading,
    refresh: mutate,
  };
}
