// components/intellog/ChatThreadView.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import { IntelChatPromptBar } from './IntelChatPromptBar';
import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ChatThreadViewProps {
  /** null when this is an unsaved "new chat" — the thread doesn't exist until the first send. */
  threadId: string | null;
}

export function ChatThreadView({ threadId: initialThreadId }: ChatThreadViewProps) {
  const router = useRouter();
  // Held in a ref (not state) so a send that fires before router.replace() has
  // committed a new URL still targets the freshly created thread instead of
  // re-creating a second one.
  const activeThreadIdRef = useRef<string | null>(initialThreadId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialThreadId));
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/api/intellog/chat/models')
      .then((res) => (res.ok ? res.json() : { models: [] }))
      .then((data) => setModels(data.models ?? []));
  }, []);

  useEffect(() => {
    if (!initialThreadId) return;
    (async () => {
      const res = await apiFetch(`/api/intellog/chat/${initialThreadId}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
      setSelectedModel(data.thread?.modelId ?? null);
      setLoading(false);
    })();
  }, [initialThreadId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(text: string) {
    setFailedMessage(null);
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setSending(true);

    try {
      const endpoint = activeThreadIdRef.current
        ? `/api/intellog/chat/${activeThreadIdRef.current}`
        : '/api/intellog/chat/new';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: selectedModel ?? undefined }),
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      if (data.threadId && !activeThreadIdRef.current) {
        activeThreadIdRef.current = data.threadId;
        router.replace(`/intellog/chat/${data.threadId}`);
      }
      setMessages((prev) => [...prev, data.message]);
    } catch {
      setFailedMessage(text);
    } finally {
      setSending(false);
    }
  }

  function retry() {
    if (!failedMessage) return;
    setMessages((prev) => prev.filter((m) => m.content !== failedMessage || m.role !== 'user'));
    handleSend(failedMessage);
  }

  if (notFound) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold">This chat no longer exists</p>
        <button type="button" className="text-sm text-primary underline" onClick={() => router.push('/intellog/chat')}>
          Back to chats
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {loading && <p className="m-auto text-sm text-muted-foreground">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="m-auto text-center text-sm text-muted-foreground">
            Ask anything about your apps, or pick a model and chat about anything else.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'ml-auto max-w-[80%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground'
                : 'mr-auto max-w-[80%] rounded-2xl bg-muted px-3 py-2 text-sm'
            }
          >
            {m.content}
          </div>
        ))}
        {failedMessage && (
          <button type="button" onClick={retry} className="ml-auto text-xs text-destructive underline">
            Failed to send — tap to retry
          </button>
        )}
      </div>
      <IntelChatPromptBar
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onSend={handleSend}
        disabled={sending}
      />
    </div>
  );
}
