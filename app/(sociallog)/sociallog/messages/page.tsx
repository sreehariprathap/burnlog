// app/(sociallog)/sociallog/messages/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { formatDistanceToNowStrict } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { NewMessageDialog } from './_components/NewMessageDialog';
import { apiFetch } from '@/lib/sociallog/apiFetch';

type Thread = {
  id: string;
  otherParticipant: { id: string; username: string; firstName: string; avatarUrl: string | null };
  lastMessageAt: string;
  lastMessageBody: string | null;
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load threads');
  return res.json();
}

export default function SocialLogMessagesPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ threads: Thread[] }>('/api/sociallog/messages/threads', fetcher);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Messages"
        actions={
          <Button variant="ghost" size="icon" onClick={() => setDialogOpen(true)} aria-label="New message">
            <PenSquare className="size-5" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-2 p-4 pb-24">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (data?.threads.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No conversations yet. Tap the pencil to start one.
          </p>
        )}
        {(data?.threads ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.push(`/sociallog/messages/${t.id}`)}
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted"
          >
            <Avatar>
              {t.otherParticipant.avatarUrl && <AvatarImage src={t.otherParticipant.avatarUrl} alt={t.otherParticipant.username} />}
              <AvatarFallback>{t.otherParticipant.firstName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">@{t.otherParticipant.username}</p>
              <p className="truncate text-xs text-muted-foreground">{t.lastMessageBody ?? 'No messages yet'}</p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDistanceToNowStrict(new Date(t.lastMessageAt), { addSuffix: true })}
            </span>
          </button>
        ))}
      </main>
      <NewMessageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onThreadCreated={(threadId) => {
          setDialogOpen(false);
          router.push(`/sociallog/messages/${threadId}`);
        }}
      />
      <SocialLogBottomNav />
    </div>
  );
}
