// lib/devError.ts
// Plain module-level pub/sub (not React context) so it's callable from
// anywhere an error can occur — a class component (ErrorBoundary), a
// non-React module (apiFetch), or a window-level listener — without any of
// them needing to know whether the current user is an admin or has the dev
// error modal enabled. That gating happens only in the one subscriber that
// renders UI (DevErrorWatcher).

export interface DevErrorReport {
  message: string;
  source: string;
  stack?: string;
  at: number;
}

type Listener = (report: DevErrorReport) => void;

const listeners = new Set<Listener>();

export function reportDevError(error: unknown, source: string): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const report: DevErrorReport = { message, source, stack, at: Date.now() };
  for (const listener of listeners) listener(report);

  // Fire-and-forget persistence — every client error is logged even when
  // no admin has the dev error modal open. Never blocks or throws back
  // into the caller that reported the original error.
  fetch('/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack, context: { source } }),
  }).catch(() => {
    // Best-effort — if this fails (offline, logged out, etc.) there's
    // nothing more useful to do than the console.error the caller may
    // already be doing.
  });
}

export function subscribeDevError(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
