import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { SNAPSHOT_EXTRACTORS } from '@/lib/intellog/extractors';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const date = new Date().toISOString().slice(0, 10);

  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id');
  if (profilesError) {
    console.error('intel-snapshot: failed to load profiles', profilesError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let snapshotsWritten = 0;
  let errors = 0;

  for (const profile of profiles ?? []) {
    for (const [app, extractor] of Object.entries(SNAPSHOT_EXTRACTORS)) {
      try {
        const metrics = await extractor(supabase, profile.id, date);
        const { error } = await supabase
          .from('intel_snapshots')
          .upsert({ profileId: profile.id, app, date, metrics }, { onConflict: 'profileId,app,date' });
        if (error) throw error;
        snapshotsWritten += 1;
      } catch (err) {
        console.error(`intel-snapshot: failed for profile ${profile.id}, app ${app}:`, err);
        errors += 1;
      }
    }
  }

  return NextResponse.json({ profilesProcessed: (profiles ?? []).length, snapshotsWritten, errors });
}
