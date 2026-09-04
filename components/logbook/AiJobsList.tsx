// components/logbook/AiJobsList.tsx
'use client';

import { useState, type MouseEvent } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

type AiJobDTO = {
  id: string;
  jobType: string;
  app: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  error: string | null;
  model: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
  input: unknown;
  output: unknown;
};

async function fetchAiJobs(): Promise<{ jobs: AiJobDTO[] }> {
  const res = await fetch('/api/ai/jobs');
  if (!res.ok) throw new Error('Failed to load AI jobs');
  return res.json();
}

async function cancelAiJob(id: string): Promise<void> {
  const res = await fetch(`/api/ai/jobs/${id}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Failed to stop job');
  }
}

// Postgres timestamps come back without a "Z" suffix (e.g.
// "2026-09-02T19:06:27.397"); `new Date(...)` on that string parses it as
// local time instead of UTC, so every relative time is off by the local
// UTC offset. Treat a Z-less ISO string as UTC explicitly.
function parseUtcDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

const STATUS_STYLES: Record<AiJobDTO['status'], string> = {
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-muted text-muted-foreground',
};

function humanizeJobType(jobType: string): string {
  return jobType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function JobRow({ job, onCancelled }: { job: AiJobDTO; onCancelled: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleStop(e: MouseEvent) {
    e.stopPropagation();
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelAiJob(job.id);
      onCancelled(job.id);
    } catch (err) {
      console.error('Failed to cancel AI job:', err);
      setCancelling(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{humanizeJobType(job.jobType)}</span>
          <span className="text-xs text-muted-foreground">
            {job.app} &middot; {formatDistanceToNow(parseUtcDate(job.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {job.status === 'running' && (
            <button
              type="button"
              onClick={handleStop}
              disabled={cancelling}
              className="rounded-full border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
            >
              {cancelling ? 'Stopping…' : 'Stop'}
            </button>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
            {job.status}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {job.status === 'error' && job.error && (
            <p className="text-xs text-red-600 dark:text-red-400">{job.error}</p>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Input</p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 text-xs">
              {JSON.stringify(job.input, null, 2)}
            </pre>
          </div>
          {job.output != null && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Output</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 text-xs">
                {JSON.stringify(job.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lists every AI job (request) logged across the app for the current user,
 * newest first — the AI Jobs tab in Quick Glance. This list is the history;
 * there's no separate history view.
 */
export function AiJobsList() {
  const { data, isLoading, mutate } = useSWR('ai-jobs', fetchAiJobs);

  function handleCancelled(id: string) {
    mutate(
      (current) =>
        current && {
          jobs: current.jobs.map((job) =>
            job.id === id ? { ...job, status: 'cancelled' as const, error: 'Cancelled by user' } : job
          ),
        },
      { revalidate: true }
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (data.jobs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No AI activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.jobs.map((job) => (
        <JobRow key={job.id} job={job} onCancelled={handleCancelled} />
      ))}
    </div>
  );
}
