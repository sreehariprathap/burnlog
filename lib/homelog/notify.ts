// lib/homelog/notify.ts
//
// Shared helper for "someone in your household did a thing" notifications —
// used when a member checks off a shared item (chore, shopping-list entry)
// so the creator/other members hear about it, not just the actor.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUser, type PushPayload } from '@/lib/pushNotification/server';

/**
 * Best-effort push (+ in-app notification, via sendPushToUser) to every
 * member of `householdId` except `actorProfileId`. Never throws — a failed
 * notification must not fail the action that triggered it.
 */
export async function notifyHouseholdExceptActor(
  admin: SupabaseClient,
  householdId: string,
  actorProfileId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const { data: members } = await admin
      .from('household_members')
      .select('profileId')
      .eq('householdId', householdId)
      .neq('profileId', actorProfileId);
    if (!members || members.length === 0) return;

    const { data: recipients } = await admin
      .from('profiles')
      .select('userId')
      .in('id', members.map((m) => m.profileId));
    if (!recipients || recipients.length === 0) return;

    await Promise.all(
      recipients.map((recipient) =>
        sendPushToUser(admin, recipient.userId, payload).catch((err) => {
          console.error('homelog household notify push failed:', err);
        })
      )
    );
  } catch (err) {
    console.error('notifyHouseholdExceptActor failed:', err);
  }
}
