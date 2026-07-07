import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import webpush from 'web-push';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:sreehariprathap1996@gmail.com', vapidPublicKey, vapidPrivateKey);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, message, url } = body;

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies });

    // Only allow a user to send to their own subscriptions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's push subscriptions (one row per device)
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription_data')
      .eq('user_id', user.id);
      
    if (error) {
      console.error("Error fetching subscriptions:", error);
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      );
    }
    
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { message: 'No subscriptions found for user' },
        { status: 404 }
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys are not configured');
      return NextResponse.json(
        { error: 'Push notifications are not configured on the server' },
        { status: 500 }
      );
    }

    const notificationPayload = JSON.stringify({
      title: title || 'burnlog Notification',
      message: message || 'You have a new notification',
      url: url || '/'
    });

    const results = await Promise.all(
      subscriptions.map(async ({ endpoint, subscription_data }) => {
        try {
          await webpush.sendNotification(subscription_data, notificationPayload);
          return { success: true };
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // This device's subscription is no longer valid on the push service's end -
          // remove only this row, leaving the user's other devices subscribed
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('user_id', user.id)
              .eq('endpoint', endpoint);
          }
          console.error('Error sending notification:', err);
          return { success: false };
        }
      })
    );

    return NextResponse.json({
      success: results.some(r => r.success),
      results
    });
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}