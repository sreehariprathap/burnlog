import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getLogbookWeekly } from '@/lib/logbook/weekly';

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

    const data = await getLogbookWeekly(admin, profileId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('logbook weekly error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
