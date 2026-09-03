// lib/sociallog/intel.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** Summarizes a profile's SocialLog activity for the IntelLog snapshot pipeline. */
export async function extractSociallogSnapshot(
  supabase: SupabaseClient,
  profileId: string,
  date: string
): Promise<Record<string, number>> {
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - 7);

  const { data: posts, error: postsError } = await supabase
    .from('social_posts')
    .select('id')
    .eq('profileId', profileId)
    .gte('createdAt', windowStart.toISOString());
  if (postsError) throw postsError;

  const { data: friends, error: friendsError } = await supabase
    .from('friendships')
    .select('id')
    .or(`requesterId.eq.${profileId},addresseeId.eq.${profileId}`)
    .eq('status', 'accepted');
  if (friendsError) throw friendsError;

  return { postsPerWeek: (posts ?? []).length, friendCount: (friends ?? []).length };
}
