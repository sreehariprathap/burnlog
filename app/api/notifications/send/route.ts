import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, message, url } = body;

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { sent } = await sendPushToUser(supabase, user.id, {
      title: title || 'burnlog Notification',
      message: message || 'You have a new notification',
      url: url || '/',
    });

    if (sent === 0) {
      return NextResponse.json({ success: false, message: 'No devices received the notification' }, { status: 404 });
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error('Server error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
