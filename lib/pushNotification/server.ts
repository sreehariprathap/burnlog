// lib/pushNotification/server.ts
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:sreehariprathap1996@gmail.com', vapidPublicKey, vapidPrivateKey);
}

export type PushPayload = { title: string; message: string; url: string };

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
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
