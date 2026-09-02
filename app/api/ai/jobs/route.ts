import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('userId', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const { data: jobs, error } = await supabase
    .from('ai_jobs')
    .select('id, jobType, app, status, error, model, durationMs, createdAt, completedAt, input, output')
    .eq('profileId', profile.id)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('ai/jobs list error:', error);
    return NextResponse.json({ error: 'Failed to load AI jobs' }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
