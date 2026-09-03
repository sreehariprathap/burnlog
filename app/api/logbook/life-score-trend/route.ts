import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getLifeScoreTrend } from '@/lib/logbook/lifeScore';

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

    const trend = await getLifeScoreTrend(admin, profileId, 30);
    return NextResponse.json({ trend });
  } catch (error) {
    console.error('life-score-trend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
