// lib/pushNotification/server.ts
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAppId, type AppId } from '@/lib/appMode';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:sreehariprathap1996@gmail.com', vapidPublicKey, vapidPrivateKey);
}

export type PushPayload = { title: string; message: string; url: string; app?: AppId };

// Every notification template's url is already namespaced under its app
// (e.g. /burnlog/session, /moneylog?tab=plan) — reused here so callers
// don't have to pass `app` explicitly just to get the right icon/color in
// the in-app notifications panel.
function inferAppFromUrl(url: string): AppId | null {
  const segment = url.split('?')[0].split('/').filter(Boolean)[0];
  return segment && isAppId(segment) ? segment : null;
}

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  // Persisted before delivery is attempted (and regardless of whether it
  // succeeds) — this is what lets a user see a notification in-app even if
  // push was never granted or a delivery attempt fails below.
  //
  // Guarded against duplicate inserts: some notifications (e.g. the
  // logbook morning brief) can be triggered more than once for the same
  // day for the same user (retried cron invocations, overlapping runs,
  // repeated manual test sends, etc). The `notifications` table has no
  // per-day uniqueness constraint, so we check for an identical row
  // (same recipient/title/message/url) already created today before
  // inserting a new one, rather than blindly appending — this keeps the
  // in-app list from filling up with back-to-back duplicates while still
  // allowing genuinely distinct notifications (different message content)
  // to appear multiple times in a day.
  try {
    const { data: recipient } = await supabase.from('profiles').select('id').eq('userId', userId).maybeSingle();
    if (recipient) {
      const startOfDayUtc = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('profileId', recipient.id)
        .eq('title', payload.title)
        .eq('message', payload.message)
        .eq('url', payload.url)
        .gte('createdAt', startOfDayUtc)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        await supabase.from('notifications').insert({
          profileId: recipient.id,
          title: payload.title,
          message: payload.message,
          url: payload.url,
          app: payload.app ?? inferAppFromUrl(payload.url),
        });
      }
    }
  } catch (notifError) {
    console.error('Error persisting notification record:', notifError);
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Push notifications are not configured on the server');
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription_data')
    .eq('user_id', userId);

  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  const notificationPayload = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subscriptions.map(async ({ endpoint, subscription_data }) => {
      try {
        await webpush.sendNotification(subscription_data, notificationPayload);
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
          pruned += 1;
        }
        console.error('Error sending notification:', err);
      }
    })
  );

  return { sent, pruned };
}
