// lib/ai/jobs.ts
import type { SupabaseClient } from '@supabase/supabase-js';

type AiJobMeta = {
  jobType: string;
  app: string;
  model?: string;
};

/**
 * Logs an AI call as a row in ai_jobs (running -> success/error) while
 * running it. Logging failures never break the underlying call: create
 * failures just skip logging, and update failures are fire-and-forget so a
 * slow/failing DB write can't delay the response to the client.
 */
export async function runAiJob<T>(
  supabase: SupabaseClient,
  profileId: string,
  meta: AiJobMeta,
  input: unknown,
  fn: () => Promise<T>
): Promise<T> {
  let jobId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('ai_jobs')
      .insert({
        profileId,
        jobType: meta.jobType,
        app: meta.app,
        model: meta.model ?? null,
        input,
        status: 'running',
      })
      .select('id')
      .single();
    if (error) throw error;
    jobId = data.id;
  } catch (err) {
    console.error('runAiJob: failed to create job record', err);
  }

  const start = Date.now();
  try {
    const result = await fn();
    if (jobId) {
      supabase
        .from('ai_jobs')
        .update({
          status: 'success',
          output: result,
          durationMs: Date.now() - start,
          completedAt: new Date().toISOString(),
        })
        .eq('id', jobId)
        .then(({ error }) => {
          if (error) console.error('runAiJob: failed to update success job record', error);
        });
    }
    return result;
  } catch (err) {
    if (jobId) {
      supabase
        .from('ai_jobs')
        .update({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
          completedAt: new Date().toISOString(),
        })
        .eq('id', jobId)
        .then(({ error }) => {
          if (error) console.error('runAiJob: failed to update error job record', error);
        });
    }
    throw err;
  }
}
