import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

const WHO_CAN_MESSAGE_VALUES = ['everyone', 'followers', 'none'] as const;
type WhoCanMessage = (typeof WHO_CAN_MESSAGE_VALUES)[number];

async function getMyProfileId(admin: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function getOrCreateSettings(admin: ReturnType<typeof createServiceRoleClient>, profileId: string) {
  const { data: existing } = await admin
    .from('social_profile_settings')
    .select('profileId, bio, isPrivate, whoCanMessage, showCrossAppActivity')
    .eq('profileId', profileId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await admin
    .from('social_profile_settings')
    .insert({ profileId })
    .select('profileId, bio, isPrivate, whoCanMessage, showCrossAppActivity')
    .single();

  if (error) throw error;
  return created;
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

    const settings = await getOrCreateSettings(admin, profileId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('sociallog profile-settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { bio, isPrivate, whoCanMessage, showCrossAppActivity } = body as {
      bio?: string | null;
      isPrivate?: boolean;
      whoCanMessage?: WhoCanMessage;
      showCrossAppActivity?: boolean;
    };

    if (whoCanMessage !== undefined && !WHO_CAN_MESSAGE_VALUES.includes(whoCanMessage)) {
      return NextResponse.json({ error: 'Invalid whoCanMessage value' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await getOrCreateSettings(admin, profileId);

    const update: Record<string, unknown> = {};
    if (bio !== undefined) update.bio = bio;
    if (isPrivate !== undefined) update.isPrivate = isPrivate;
    if (whoCanMessage !== undefined) update.whoCanMessage = whoCanMessage;
    if (showCrossAppActivity !== undefined) update.showCrossAppActivity = showCrossAppActivity;

    const { data: updated, error } = await admin
      .from('social_profile_settings')
      .update(update)
      .eq('profileId', profileId)
      .select('profileId, bio, isPrivate, whoCanMessage, showCrossAppActivity')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('sociallog profile-settings PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
