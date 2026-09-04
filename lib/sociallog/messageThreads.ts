// lib/sociallog/messageThreads.ts
// Shared get-or-create logic for SocialLog DM threads, used by both the
// "start a new conversation" endpoint and the send-message endpoint (which
// falls back to creating the thread on the fly if it doesn't exist yet —
// see app/api/sociallog/messages/threads/[id]/messages/route.ts).
import type { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

export type GetOrCreateThreadResult =
  | { ok: true; threadId: string }
  | { ok: false; status: number; error: string };

/**
 * Finds the existing 1:1 thread between `meId` and `targetProfileId`, or
 * creates it if none exists yet. Respects the target's `whoCanMessage`
 * privacy setting. participantAId/participantBId are always stored with the
 * lexicographically smaller profile id first (see schema.prisma), so lookup
 * and insert both sort the pair the same way.
 */
export async function getOrCreateThread(
  admin: Admin,
  meId: string,
  targetProfileId: string
): Promise<GetOrCreateThreadResult> {
  if (meId === targetProfileId) {
    return { ok: false, status: 400, error: "You can't message yourself" };
  }

  const { data: targetSettings } = await admin
    .from('social_profile_settings')
    .select('whoCanMessage')
    .eq('profileId', targetProfileId)
    .maybeSingle();
  const whoCanMessage = targetSettings?.whoCanMessage ?? 'everyone';

  if (whoCanMessage === 'none') {
    return { ok: false, status: 403, error: 'This user is not accepting messages' };
  }
  if (whoCanMessage === 'followers') {
    const { data: followsMe } = await admin
      .from('social_follows')
      .select('id')
      .eq('followerId', targetProfileId)
      .eq('followingId', meId)
      .maybeSingle();
    if (!followsMe) {
      return { ok: false, status: 403, error: 'This user only accepts messages from followers' };
    }
  }

  const [participantAId, participantBId] = [meId, targetProfileId].sort();

  const { data: existing } = await admin
    .from('social_message_threads')
    .select('id')
    .eq('participantAId', participantAId)
    .eq('participantBId', participantBId)
    .maybeSingle();

  if (existing) {
    return { ok: true, threadId: existing.id as string };
  }

  const { data: created, error } = await admin
    .from('social_message_threads')
    .insert({ participantAId, participantBId })
    .select('id')
    .single();

  if (error) {
    // Unique constraint race: another request created the thread between our
    // existence check and insert (e.g. both sides said "hi" at once, or a
    // concurrent retry). Re-fetch instead of surfacing a spurious 400.
    if (error.code === '23505') {
      const { data: raced } = await admin
        .from('social_message_threads')
        .select('id')
        .eq('participantAId', participantAId)
        .eq('participantBId', participantBId)
        .maybeSingle();
      if (raced) {
        return { ok: true, threadId: raced.id as string };
      }
    }
    return { ok: false, status: 400, error: error.message };
  }

  return { ok: true, threadId: created.id as string };
}
