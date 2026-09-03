// app/(sociallog)/sociallog/messages/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare, RefreshCw } from 'lucide-react';
import { NewMessageDialog } from './_components/NewMessageDialog';
import { formatRelative } from '@/lib/format';
import { ChatEmptyIllustration } from '@/components/sociallog/ChatEmptyIllustration';
import { threadsQuery, type Thread } from '@/lib/sociallog/queries';

export default function SocialLogMessagesPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ threads: Thread[] }>(threadsQuery().key, threadsQuery().fetcher);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Messages"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => mutate()} aria-label="Refresh">
              <RefreshCw className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDialogOpen(true)} aria-label="New message">
              <PenSquare className="size-5" />
            </Button>
          </div>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-2 p-4 pb-24">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (data?.threads.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2">
            <ChatEmptyIllustration title="No conversations yet" subtitle="Tap the pencil to start one" />
            <Button size="sm" className="mt-2" onClick={() => setDialogOpen(true)}>
              New message
            </Button>
          </div>
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
              {formatRelative(t.lastMessageAt)}
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
