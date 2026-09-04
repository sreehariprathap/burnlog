// lib/ai/jobs.ts
import type { SupabaseClient } from '@supabase/supabase-js';

type AiJobMeta = {
  jobType: string;
  app: string;
  model?: string;
};

/**
 * Thrown from inside a runAiJob closure to fail with a specific HTTP status
 * (e.g. 422 for a rejected AI answer, 502 for a malformed one) instead of
 * the generic 500 the route's outer catch would otherwise return. runAiJob
 * still logs the job as status "error" with this error's message; the
 * route's own catch block is responsible for checking
 * `instanceof AiRouteError` and mapping it back to `err.status`.
 */
export class AiRouteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiRouteError';
    this.status = status;
  }
}

/**
 * In-memory registry of AbortControllers for jobs currently running in this
 * process, keyed by ai_jobs.id. Lets a "Stop" request (see
 * app/api/ai/jobs/[id]/cancel/route.ts) abort the in-flight fetch/stream
 * behind a running job by calling `cancelAiJob`.
 *
 * This only helps when the cancel request lands on the same server instance
 * that's running the job (true for a single Node process; not guaranteed
 * across serverless instances). The cancel route also flips the DB row to
 * "cancelled" unconditionally, and `runAiJob` below refuses to overwrite a
 * row that's already "cancelled" once its call resolves — so even a
 * cross-instance cancel reliably updates the job's final status, it just
 * can't reclaim the in-flight network call in that case.
 */
const runningJobs = new Map<string, AbortController>();

/**
 * Aborts the in-flight AI call for `jobId` if it's running in this process.
 * Returns true if a controller was found (and aborted).
 */
export function cancelAiJob(jobId: string): boolean {
  const controller = runningJobs.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return (err as { name?: unknown }).name === 'AbortError';
  }
  return false;
}

/**
 * Logs an AI call as a row in ai_jobs (running -> success/error/cancelled)
 * while running it. `fn` receives an AbortSignal that fires when the job is
 * cancelled via `cancelAiJob` (from the /api/ai/jobs/[id]/cancel route) —
 * pass it through to the underlying fetch/SDK call (e.g.
 * `client.chat.completions.create(params, { signal })`) so cancelling
 * actually interrupts the request instead of just hiding it in the UI.
 *
 * Logging failures never break the underlying call: create failures just
 * skip logging, and update failures are fire-and-forget so a slow/failing
 * DB write can't delay the response to the client.
 */
export async function runAiJob<T>(
  supabase: SupabaseClient,
  profileId: string,
  meta: AiJobMeta,
  input: unknown,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  let jobId: string | null = null;
  const controller = new AbortController();
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
    if (jobId) runningJobs.set(jobId, controller);
  } catch (err) {
    console.error('runAiJob: failed to create job record', err);
  }

  const start = Date.now();
  try {
    const result = await fn(controller.signal);
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
        .neq('status', 'cancelled')
        .then(({ error }) => {
          if (error) console.error('runAiJob: failed to update success job record', error);
        });
    }
    return result;
  } catch (err) {
    const cancelled = controller.signal.aborted || isAbortError(err);
    if (jobId) {
      supabase
        .from('ai_jobs')
        .update({
          status: cancelled ? 'cancelled' : 'error',
          error: cancelled ? 'Cancelled by user' : err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
          completedAt: new Date().toISOString(),
        })
        .eq('id', jobId)
        .neq('status', 'cancelled')
        .then(({ error }) => {
          if (error) console.error('runAiJob: failed to update error job record', error);
        });
    }
    throw err;
  } finally {
    if (jobId) runningJobs.delete(jobId);
  }
}
