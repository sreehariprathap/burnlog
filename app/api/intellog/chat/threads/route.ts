// app/api/intellog/chat/threads/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('intel_chat_threads')
      .select('id, title, modelId, updatedAt')
      .eq('profileId', profileId)
      .order('updatedAt', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ threads: data ?? [] });
  } catch (error) {
    console.error('intellog chat threads GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
