// app/api/intellog/chat/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getOrCreateThread(admin: Admin, profileId: string): Promise<string> {
  const { data: existing } = await admin
    .from('intel_chat_threads')
    .select('id')
    .eq('profileId', profileId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from('intel_chat_threads')
    .insert({ profileId })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

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

    const threadId = await getOrCreateThread(admin, profileId);
    const { data: messages, error } = await admin
      .from('intel_chat_messages')
      .select('id, role, content, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ messages: messages ?? [] });
  } catch (error) {
    console.error('intellog chat GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
