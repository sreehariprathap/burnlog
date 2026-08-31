import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getLogbookCorrelation } from '@/lib/logbook/correlation';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const data = await getLogbookCorrelation(admin, profileId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('logbook correlation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
