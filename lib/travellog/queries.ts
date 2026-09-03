// lib/travellog/queries.ts
//
// Single source of truth for TravelLog's preloadable page queries — same
// pattern as the burnlog/moneylog/tasklog registries. `visitsQuery` in
// particular replaces a fetchVisits() function that was copy-pasted
// verbatim into both page.tsx (Home) and map/page.tsx before this file
// existed — same SWR key in both (so no double-fetch bug), but the same
// query logic duplicated across two files instead of shared.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import type { TravelVisitRow } from '@/lib/travellog/types';
import type { TripCardItem } from '@/components/travellog/WeeklyTripStack';

export async function fetchVisits(supabase: SupabaseClient, profileId: string): Promise<TravelVisitRow[]> {
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export function visitsQuery(profileId: string) {
  return {
    key: ['travellog-visits', profileId] as const,
    fetcher: () => fetchVisits(createClient(), profileId),
  };
}

export type TripSummary = {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  myRole: 'owner' | 'member';
};

export async function fetchTrips(): Promise<{ plans: TripSummary[] }> {
  const res = await apiFetch('/api/travellog/plans');
  if (!res.ok) throw new Error('Failed to load trips');
  return res.json();
}

export function tripsQuery() {
  return {
    key: '/api/travellog/plans',
    fetcher: fetchTrips,
  };
}

export async function fetchWeeklySuggestions(supabase: SupabaseClient, profileId: string): Promise<TripCardItem[]> {
  const { data } = await supabase
    .from('travellog_weekly_suggestions')
    .select('id, destination, country, startDate, endDate, windowLabel, reason')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: true });
  return (data as TripCardItem[]) ?? [];
}

export function weeklySuggestionsQuery(profileId: string) {
  return {
    key: ['travellog-weekly-suggestions', profileId] as const,
    fetcher: () => fetchWeeklySuggestions(createClient(), profileId),
  };
}
