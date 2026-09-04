// app/api/ai/jobs/[id]/cancel/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelAiJob } from '@/lib/ai/jobs';

/**
 * Stops a running AI job: aborts its in-flight AI call (if this server
 * instance is the one running it) and marks the ai_jobs row "cancelled" so
 * runAiJob's own completion handler won't overwrite it back to
 * success/error once the (now-aborted) call settles.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  // Only the job's own owner can cancel it, and only while it's running.
  const { data: job } = await supabase
    .from('ai_jobs')
    .select('id, profileId, status')
    .eq('id', id)
    .single();

  if (!job || job.profileId !== profile.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (job.status !== 'running') {
    return NextResponse.json({ error: 'Job is not running' }, { status: 409 });
  }

  // Abort the in-flight call if it's running in this process.
  cancelAiJob(id);

  const { data: updated, error } = await supabase
    .from('ai_jobs')
    .update({
      status: 'cancelled',
      error: 'Cancelled by user',
      completedAt: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'running')
    .select('id, jobType, app, status, error, model, durationMs, createdAt, completedAt, input, output')
    .single();

  if (error) {
    console.error('ai/jobs/[id]/cancel error:', error);
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }

  return NextResponse.json({ job: updated });
}
