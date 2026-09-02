import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export type ErrorSource = 'client' | 'server' | 'worker';

export interface ErrorLogRow {
  source: ErrorSource;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export function toErrorLogRow(
  source: ErrorSource,
  error: unknown,
  context?: Record<string, unknown>
): ErrorLogRow {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return { source, message, stack, context };
}

/**
 * Persist an error to adminlog_error_logs. Never throws — a failure here
 * must not take down whatever call site is reporting the original error.
 */
export async function logError(
  source: ErrorSource,
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    const row = toErrorLogRow(source, error, context);
    const admin = createServiceRoleClient();
    await admin.from('adminlog_error_logs').insert([row]);
  } catch (loggingError) {
    console.error('logError failed:', loggingError);
  }
}
