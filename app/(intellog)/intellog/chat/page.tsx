// app/(intellog)/intellog/chat/page.tsx
'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { PlusIcon, Trash2Icon, MessageCircleIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';
import { useConfirm } from '@/lib/useConfirm';

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

export default function IntelLogChatListPage() {
  const { data, mutate } = useSWR<{ threads: ThreadRow[] }>('/api/intellog/chat/threads', fetcher);
  const threads = data?.threads ?? [];
  const { confirm, ConfirmDialog } = useConfirm();

  async function handleDelete(e: React.MouseEvent, threadId: string) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({ title: 'Delete this chat?', description: 'This cannot be undone.', destructive: true });
    if (!ok) return;
    await apiFetch(`/api/intellog/chat/threads/${threadId}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Chat"
        actions={
          <Link
            href="/intellog/chat/new"
            aria-label="New chat"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <PlusIcon className="h-4 w-4" />
          </Link>
        }
      />
      <div className="flex flex-col gap-2 px-4 py-4">
        {!data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <MessageCircleIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">No chats yet</p>
            <p className="text-xs text-muted-foreground">Start a new chat and pick any AI model to talk to.</p>
          </div>
        ) : (
          threads.map((t) => (
            <Link
              key={t.id}
              href={`/intellog/chat/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border p-4 hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t.title || 'New chat'}</p>
                <p className="text-xs text-muted-foreground">{formatRelative(t.updatedAt)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => handleDelete(e, t.id)}
                aria-label="Delete chat"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </Link>
          ))
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}
