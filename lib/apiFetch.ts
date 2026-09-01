import { toast } from '@/components/ui/use-toast';
import { reportDevError } from '@/lib/devError';

/**
 * Drop-in replacement for fetch() used by every SocialLog client component.
 * On a network failure or a non-2xx response, shows a toast (reusing the
 * project's existing shadcn toast system — no new dependency) and still
 * returns a Response so callers can keep their existing `if (res.ok)` /
 * `.json()` control flow unchanged.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    toast({
      variant: 'destructive',
      title: 'Network error',
      description: 'Could not reach the server. Check your connection and try again.',
    });
    reportDevError(err, `Network error: ${init?.method ?? 'GET'} ${input}`);
    return new Response(JSON.stringify({ error: 'Network error' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const json = await res.clone().json();
      if (json?.error) message = json.error;
    } catch {
      // Response wasn't JSON — keep the generic message.
    }
    toast({ variant: 'destructive', title: 'Request failed', description: message });
    reportDevError(
      new Error(message),
      `API error: ${init?.method ?? 'GET'} ${input} → ${res.status}`
    );
  }

  return res;
}
