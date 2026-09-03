// lib/sociallog/queries.ts
//
// Single source of truth for SocialLog's preloadable page queries — same
// pattern as the seven prior registries. Deliberately small: this app's
// Home feed is tab/sort-scoped (changes on every filter tap) and Search
// has no page-level query at all — see the plan's Architecture note for
// why those two are excluded rather than forced into a registry entry.
import { apiFetch } from '@/lib/apiFetch';

export async function fetchStats(): Promise<{ followers: number; posts: number }> {
  const res = await apiFetch('/api/sociallog/stats');
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export function statsQuery() {
  return {
    key: '/api/sociallog/stats',
    fetcher: fetchStats,
  };
}

export type Thread = {
  id: string;
  otherParticipant: { id: string; username: string; firstName: string; avatarUrl: string | null };
  lastMessageAt: string;
  lastMessageBody: string | null;
};

export async function fetchThreads(): Promise<{ threads: Thread[] }> {
  const res = await apiFetch('/api/sociallog/messages/threads');
  if (!res.ok) throw new Error('Failed to load threads');
  return res.json();
}

export function threadsQuery() {
  return {
    key: '/api/sociallog/messages/threads',
    fetcher: fetchThreads,
  };
}
