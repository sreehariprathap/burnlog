// components/AppSwitcherChat.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SiriOrb from '@/components/smoothui/siri-orb';
import SmoothButton from '@/components/smoothui/smooth-button';
import type { AIState } from '@/components/smoothui/ai-core';
import { apiFetch } from '@/lib/apiFetch';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

type Phase = 'idle' | 'submitting' | 'done' | 'error';

const PHASE_TO_ORB_STATE: Record<Phase, AIState> = {
  done: 'done',
  error: 'error',
  idle: 'idle',
  submitting: 'thinking',
};

interface AppSwitcherChatProps {
  open: boolean;
}

export function AppSwitcherChat({ open }: AppSwitcherChatProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const res = await apiFetch('/api/intellog/chat');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
      setLoaded(true);
    })();
  }, [open, loaded]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setFailedMessage(null);
    setInput('');
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setPhase('submitting');

    try {
      const res = await apiFetch('/api/intellog/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setPhase('done');
      setTimeout(() => setPhase('idle'), 1200);
    } catch {
      setFailedMessage(trimmed);
      setPhase('error');
      setTimeout(() => setPhase('idle'), 1200);
    }
  }

  function retry() {
    if (!failedMessage) return;
    setMessages((prev) => prev.filter((m) => m.content !== failedMessage || m.role !== 'user'));
    send(failedMessage);
  }

  return (
    <div className="px-4 pb-2">
      <motion.div
        animate={{ height: expanded ? 260 : 48 }}
        className="overflow-hidden rounded-2xl border bg-background"
        initial={false}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      >
        <AnimatePresence>
          {expanded && (
            <motion.div
              animate={{ opacity: 1 }}
              className="flex h-[212px] flex-col gap-2 overflow-y-auto p-3"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              ref={listRef}
            >
              {messages.length === 0 && loaded && (
                <p className="m-auto text-center text-xs text-muted-foreground">
                  Ask anything about your apps — spending, streaks, tasks, trips.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[80%] rounded-2xl bg-primary px-3 py-1.5 text-sm text-primary-foreground'
                      : 'mr-auto max-w-[80%] rounded-2xl bg-muted px-3 py-1.5 text-sm'
                  }
                >
                  {m.content}
                </div>
              ))}
              {failedMessage && (
                <button
                  type="button"
                  onClick={retry}
                  className="ml-auto text-xs text-destructive underline"
                >
                  Failed to send — tap to retry
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          className="flex h-12 items-center gap-2 px-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label="Toggle chat"
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-visible"
          >
            <SiriOrb state={PHASE_TO_ORB_STATE[phase]} size="24px" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="Ask AI about your apps…"
            className="flex-1 bg-transparent text-sm outline-none"
            disabled={phase === 'submitting'}
          />
          <SmoothButton type="submit" variant="ghost" disabled={phase === 'submitting' || !input.trim()}>
            Send
          </SmoothButton>
        </form>
      </motion.div>
    </div>
  );
}
