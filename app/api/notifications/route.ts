import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
      admin
        .from('notifications')
        .select('id, title, message, url, read, createdAt')
        .eq('profileId', me.id)
        .order('createdAt', { ascending: false })
        .limit(30),
      admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profileId', me.id)
        .eq('read', false),
    ]);

    return NextResponse.json({ notifications: notifications ?? [], unreadCount: unreadCount ?? 0 });
  } catch (error) {
    console.error('list notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
