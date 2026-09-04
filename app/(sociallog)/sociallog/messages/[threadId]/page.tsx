// app/(sociallog)/sociallog/messages/[threadId]/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Send } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatRelative } from '@/lib/format';
import { ChatEmptyIllustration } from '@/components/sociallog/ChatEmptyIllustration';

const HEARTBEAT_INTERVAL_MS = 15_000;

type Message = { id: string; body: string; senderId: string; createdAt: string };

export default function SocialLogThreadPage() {
  const router = useRouter();
  const params = useParams<{ threadId: string }>();
  const searchParams = useSearchParams();
  const threadId = params.threadId;
  // Optional hint: the other participant's profile id, passed along when
  // navigating into a conversation that might not have a thread row yet
  // (e.g. a brand-new conversation). If sending 404s with "thread not
  // found", this lets the send endpoint create the thread on the fly
  // instead of failing outright — see the POST handler for
  // /api/sociallog/messages/threads/[id]/messages.
  const targetProfileId = searchParams.get('with');
  const supabase = createClient();
  const { profile } = useCurrentProfile();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`/api/sociallog/messages/threads/${threadId}/messages`);
      if (res.ok && !cancelled) {
        const json: { messages: Message[] } = await res.json();
        setMessages(json.messages);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    const channel = supabase
      .channel(`social_messages:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_messages', filter: `threadId=eq.${threadId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Tell the server we're actively viewing this thread, so a new message
  // doesn't also trigger a push notification for us — see the message POST
  // route, which skips the push when this heartbeat is recent.
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') {
        apiFetch(`/api/sociallog/messages/threads/${threadId}/heartbeat`, { method: 'POST' }).catch(() => {});
      }
    };
    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [threadId]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const res = await apiFetch(`/api/sociallog/messages/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: text.trim(),
        ...(targetProfileId ? { targetProfileId } : {}),
      }),
    });
    if (res.ok) {
      const created: Message & { threadId?: string } = await res.json();
      setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      setText('');
      // The send endpoint may have had to create the thread on the fly
      // (get-or-create fallback), in which case its real id can differ from
      // the id we navigated here with — sync the URL so refresh/realtime/
      // heartbeat all key off the actual thread.
      if (created.threadId && created.threadId !== threadId) {
        router.replace(`/sociallog/messages/${created.threadId}`);
      }
    } else {
      toast({ title: 'Failed to send message', variant: 'destructive' });
    }
    setSending(false);
  };

  const showEmptyState = !loading && messages.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar title="Conversation" onClose={() => router.push('/sociallog/messages')} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {loading && <Loader2 className="h-6 w-6 animate-spin" />}
          {showEmptyState && (
            <ChatEmptyIllustration title="No messages yet" subtitle="Say hi to start the conversation" />
          )}
          {messages.map((m) => {
            const isMine = m.senderId === profile?.id;
            return (
              <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>
                  <p className="mt-0.5 text-[10px] opacity-70">
                    {formatRelative(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 border-t p-4">
          <Label htmlFor="thread-message" className="sr-only">
            Message
          </Label>
          <Input
            id="thread-message"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
          />
          <Button size="icon" aria-label="Send message" onClick={handleSend} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
