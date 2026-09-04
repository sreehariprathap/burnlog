// lib/watchlog/queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { WatchItemRow, WatchStatus, TmdbItem } from './types';

export async function fetchWatchItems(
  supabase: SupabaseClient,
  profileId: string,
  status?: WatchStatus
): Promise<WatchItemRow[]> {
  let query = supabase.from('watch_items').select('*').eq('profileId', profileId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('updatedAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WatchItemRow[];
}

export function watchItemsQuery(profileId: string, status?: WatchStatus) {
  return {
    key: ['watchlog-items', profileId, status ?? 'all'] as const,
    fetcher: () => fetchWatchItems(createClient(), profileId, status),
  };
}

export async function addWatchItem(
  supabase: SupabaseClient,
  profileId: string,
  item: TmdbItem
): Promise<WatchItemRow> {
  const { data, error } = await supabase
    .from('watch_items')
    .insert({
      profileId,
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath,
      releaseYear: item.releaseYear,
      genres: item.genres,
      status: 'want',
    })
    .select()
    .single();
  if (error) throw error;
  return data as WatchItemRow;
}

export async function updateWatchItem(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<WatchItemRow, 'status' | 'rating' | 'currentSeason' | 'currentEpisode' | 'notes' | 'tags' | 'completedAt'>>
): Promise<void> {
  const { error } = await supabase.from('watch_items').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteWatchItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('watch_items').delete().eq('id', id);
  if (error) throw error;
}
