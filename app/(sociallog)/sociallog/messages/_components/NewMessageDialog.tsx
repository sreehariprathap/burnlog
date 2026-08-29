// app/(sociallog)/sociallog/messages/_components/NewMessageDialog.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/sociallog/apiFetch';

type UserResult = { id: string; username: string; firstName: string; avatarUrl: string | null };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export function NewMessageDialog({
  open,
  onOpenChange,
  onThreadCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThreadCreated: (threadId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { data, isLoading } = useSWR<{ results: UserResult[] }>(
    query.trim().length >= 2 ? `/api/sociallog/search/users?q=${encodeURIComponent(query)}` : null,
    fetcher
  );

  const start = async (targetProfileId: string) => {
    setStarting(true);
    setError(null);
    const res = await apiFetch('/api/sociallog/messages/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProfileId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to start conversation');
      setStarting(false);
      return;
    }
    onThreadCreated(json.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username…" autoFocus />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(data?.results ?? []).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => start(u.id)}
              disabled={starting}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <Avatar className="size-8">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
                <AvatarFallback className="text-xs">{u.firstName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">@{u.username}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
