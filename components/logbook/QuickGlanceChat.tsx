// components/logbook/QuickGlanceChat.tsx
'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { PlusIcon, MessageCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';

interface ThreadRow {
  id: string;
  title: string | null;
  modelId: string | null;
  updatedAt: string;
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load chats');
  return res.json();
}

/** Compact IntelLog chat thread list for the Quick Glance drawer — picking
 * a thread (or starting a new one) navigates to the full IntelLog chat page
 * and closes the drawer. IntelLog's own bottom nav no longer links here;
 * this is the chat feature's entry point now. */
export function QuickGlanceChat({ onNavigate }: { onNavigate: () => void }) {
  const { data } = useSWR<{ threads: ThreadRow[] }>('/api/intellog/chat/threads', fetcher);
  const router = useRouter();
  const threads = data?.threads ?? [];

  function go(href: string) {
    onNavigate();
    router.push(href);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" className="gap-2 self-start" onClick={() => go('/intellog/chat/new')}>
        <PlusIcon className="h-4 w-4" />
        New chat
      </Button>
      {!data ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <MessageCircleIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">No chats yet</p>
          <p className="text-xs text-muted-foreground">Start a new chat and pick any AI model to talk to.</p>
        </div>
      ) : (
        threads.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(`/intellog/chat/${t.id}`)}
            className="flex items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-accent"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t.title || 'New chat'}</p>
              <p className="text-xs text-muted-foreground">{formatRelative(t.updatedAt)}</p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
