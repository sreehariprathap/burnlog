# SocialLog Messages (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SocialLog Messages placeholder with working 1:1 direct messages — a thread list, starting a new conversation (respecting the recipient's `whoCanMessage` privacy setting), and a thread view that updates live via Supabase Realtime.

**Architecture:** Two new API routes (`/api/sociallog/messages/threads` for listing/creating threads, `/api/sociallog/messages/threads/[id]/messages` for listing/sending within one) follow the exact auth shape from every prior phase. `SocialMessageThread` rows are normalized (`participantAId`/`participantBId` sorted lexicographically) so a pair of users always maps to exactly one thread — the same find-or-create pattern already used for `SocialProfileSettings` in Foundation. The thread view is a new dynamic route `app/(sociallog)/sociallog/messages/[threadId]/page.tsx`; after its initial SWR fetch it opens a Supabase Realtime channel filtered to that thread's `postgres_changes` INSERT events, so both participants see new messages without polling. Realtime delivery is gated by the same RLS policy (`social_messages_participant_read`) already in place from Foundation, but the `social_messages` table also needs to be added to Supabase's `supabase_realtime` publication — off by default for every table — which this plan does via a migration.

**Tech Stack:** Same as Phases 1-3 — Next.js 15 App Router, React 19, TypeScript, `@supabase/supabase-js` (REST + Realtime), SWR, shadcn/ui, lucide-react, `date-fns`.

## Global Constraints

- No automated test suite. Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual checks against `npm run dev` with two browser sessions (to see Realtime delivery both ways) plus the seeded welcome DM thread from Phase 2.
- Every new API route follows the exact auth shape used throughout `app/api/sociallog/*`.
- Do not touch `(burnlog)`, `(lifelog)`, `(homelog)`, `(tasklog)`, or `app/api/social/*`.
- `whoCanMessage` is enforced only at thread-creation time (starting a new conversation), not on every message send within an already-existing thread — matching how DMs behave everywhere else (permission gates who can start a conversation, not each message in an ongoing one).

---

### Task 1: Enable Realtime on `social_messages`

**Files:** none (Supabase migration only, applied via the `apply_migration` tool against the live project — same mechanism used for Foundation's RLS/storage migration).

**Interfaces:** none — this is infrastructure Task 4's client-side subscription depends on.

- [ ] **Step 1: Apply the migration**

Run via the Supabase MCP `apply_migration` tool (name: `sociallog_enable_realtime_messages`):

```sql
alter publication supabase_realtime add table social_messages;
```

- [ ] **Step 2: Verify**

Query: `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'social_messages';`
Expected: one row returned.

---

### Task 2: Message threads API (list + create/find)

**Files:**
- Create: `app/api/sociallog/messages/threads/route.ts`

**Interfaces:**
- Produces: `GET /api/sociallog/messages/threads` → `{ threads: { id, otherParticipant: { id, username, firstName, avatarUrl }, lastMessageAt, lastMessageBody: string | null, lastMessageSenderId: string | null }[] }`, ordered by `lastMessageAt` desc. `POST /api/sociallog/messages/threads` with `{ targetProfileId: string }` → `{ id: string }` (the thread id, found or created) or a 403 with `{ error }` if the target's `whoCanMessage` blocks it. Consumed by Task 4's thread list page and `NewMessageDialog`.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/messages/threads/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: threadRows, error } = await admin
      .from('social_message_threads')
      .select('id, participantAId, participantBId, lastMessageAt, participantA:profiles!social_message_threads_participantAId_fkey(id, username, firstName, avatarUrl), participantB:profiles!social_message_threads_participantBId_fkey(id, username, firstName, avatarUrl)')
      .or(`participantAId.eq.${meId},participantBId.eq.${meId}`)
      .order('lastMessageAt', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type ThreadRow = {
      id: string;
      participantAId: string;
      participantBId: string;
      lastMessageAt: string;
      participantA: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
      participantB: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
    };

    const rows = (threadRows ?? []) as unknown as ThreadRow[];
    const threadIds = rows.map((t) => t.id);

    const { data: lastMessages } = await admin
      .from('social_messages')
      .select('threadId, body, senderId, createdAt')
      .in('threadId', threadIds.length ? threadIds : ['00000000-0000-0000-0000-000000000000'])
      .order('createdAt', { ascending: false });

    const lastMessageByThread = new Map<string, { body: string; senderId: string }>();
    for (const m of lastMessages ?? []) {
      if (!lastMessageByThread.has(m.threadId)) {
        lastMessageByThread.set(m.threadId, { body: m.body, senderId: m.senderId });
      }
    }

    const threads = rows
      .filter((t) => t.participantA !== null && t.participantB !== null)
      .map((t) => {
        const otherParticipant = t.participantAId === meId ? t.participantB! : t.participantA!;
        const last = lastMessageByThread.get(t.id);
        return {
          id: t.id,
          otherParticipant,
          lastMessageAt: t.lastMessageAt,
          lastMessageBody: last?.body ?? null,
          lastMessageSenderId: last?.senderId ?? null,
        };
      });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error('sociallog threads GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { targetProfileId } = body as { targetProfileId?: string };
    if (!targetProfileId) {
      return NextResponse.json({ error: 'targetProfileId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (meId === targetProfileId) {
      return NextResponse.json({ error: "You can't message yourself" }, { status: 400 });
    }

    const { data: targetSettings } = await admin
      .from('social_profile_settings')
      .select('whoCanMessage')
      .eq('profileId', targetProfileId)
      .maybeSingle();
    const whoCanMessage = targetSettings?.whoCanMessage ?? 'everyone';

    if (whoCanMessage === 'none') {
      return NextResponse.json({ error: 'This user is not accepting messages' }, { status: 403 });
    }
    if (whoCanMessage === 'followers') {
      const { data: followsMe } = await admin
        .from('social_follows')
        .select('id')
        .eq('followerId', targetProfileId)
        .eq('followingId', meId)
        .maybeSingle();
      if (!followsMe) {
        return NextResponse.json({ error: 'This user only accepts messages from followers' }, { status: 403 });
      }
    }

    const [participantAId, participantBId] = [meId, targetProfileId].sort();

    const { data: existing } = await admin
      .from('social_message_threads')
      .select('id')
      .eq('participantAId', participantAId)
      .eq('participantBId', participantBId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ id: existing.id });
    }

    const { data: created, error } = await admin
      .from('social_message_threads')
      .insert({ participantAId, participantBId })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: created.id });
  } catch (error) {
    console.error('sociallog threads POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/sociallog/messages/threads/route.ts
git commit -m "feat(sociallog): add message threads list/create API"
```

---

### Task 3: Messages-within-a-thread API

**Files:**
- Create: `app/api/sociallog/messages/threads/[id]/messages/route.ts`

**Interfaces:**
- Produces: `GET /api/sociallog/messages/threads/:id/messages` → `{ messages: { id, body, senderId, createdAt }[] }` (ascending, oldest first), 403 if the caller isn't a participant. `POST .../messages` with `{ body: string }` → the created message `{ id, body, senderId, createdAt }`, and bumps the thread's `lastMessageAt`. Consumed by Task 4's thread view page.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/messages/threads/[id]/messages/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function assertParticipant(admin: Admin, threadId: string, meId: string) {
  const { data: thread } = await admin
    .from('social_message_threads')
    .select('id, participantAId, participantBId')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return false;
  return thread.participantAId === meId || thread.participantBId === meId;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: threadId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!(await assertParticipant(admin, threadId, meId))) {
      return NextResponse.json({ error: 'Not a participant in this thread' }, { status: 403 });
    }

    const { data: rows, error } = await admin
      .from('social_messages')
      .select('id, body, senderId, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ messages: rows ?? [] });
  } catch (error) {
    console.error('sociallog thread messages GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: threadId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { body: text } = body as { body?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!(await assertParticipant(admin, threadId, meId))) {
      return NextResponse.json({ error: 'Not a participant in this thread' }, { status: 403 });
    }

    const { data: created, error } = await admin
      .from('social_messages')
      .insert({ threadId, senderId: meId, body: text.trim() })
      .select('id, body, senderId, createdAt')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await admin.from('social_message_threads').update({ lastMessageAt: created.createdAt }).eq('id', threadId);

    return NextResponse.json(created);
  } catch (error) {
    console.error('sociallog thread messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add "app/api/sociallog/messages/threads/[id]/messages/route.ts"
git commit -m "feat(sociallog): add thread messages list/send API"
```

---

### Task 4: Messages UI — thread list + new-message dialog

**Files:**
- Create: `app/(sociallog)/sociallog/messages/_components/NewMessageDialog.tsx`
- Modify: `app/(sociallog)/sociallog/messages/page.tsx` (replace the placeholder body)

**Interfaces:**
- Consumes: `GET/POST /api/sociallog/messages/threads` (Task 2), `GET /api/sociallog/search/users` (Phase 3).
- Produces: `<NewMessageDialog open onOpenChange onThreadCreated={(threadId) => void} />`, consumed only by this task's `page.tsx`.

- [ ] **Step 1: Create `NewMessageDialog.tsx`**

```tsx
// app/(sociallog)/sociallog/messages/_components/NewMessageDialog.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';

type UserResult = { id: string; username: string; firstName: string; avatarUrl: string | null };

async function fetcher(url: string) {
  const res = await fetch(url);
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
    const res = await fetch('/api/sociallog/messages/threads', {
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
```

- [ ] **Step 2: Wire the thread list page**

Replace the full contents of `app/(sociallog)/sociallog/messages/page.tsx` with:

```tsx
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

type Thread = {
  id: string;
  otherParticipant: { id: string; username: string; firstName: string; avatarUrl: string | null };
  lastMessageAt: string;
  lastMessageBody: string | null;
};

async function fetcher(url: string) {
  const res = await fetch(url);
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
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(sociallog)/sociallog/messages/_components" "app/(sociallog)/sociallog/messages/page.tsx"
git commit -m "feat(sociallog): build the Messages thread list + new-message dialog"
```

---

### Task 5: Thread view with Realtime

**Files:**
- Create: `app/(sociallog)/sociallog/messages/[threadId]/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/sociallog/messages/threads/:id/messages` (Task 3), Supabase Realtime (`social_messages` postgres_changes, enabled in Task 1).
- Produces: no exports consumed elsewhere — this is a leaf route.

- [ ] **Step 1: Create the thread view page**

```tsx
// app/(sociallog)/sociallog/messages/[threadId]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentProfile } from '@/lib/useCurrentProfile';

type Message = { id: string; body: string; senderId: string; createdAt: string };

export default function SocialLogThreadPage() {
  const router = useRouter();
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;
  const supabase = createClientComponentClient();
  const { profile } = useCurrentProfile();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sociallog/messages/threads/${threadId}/messages`);
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

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/sociallog/messages/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim() }),
    });
    if (res.ok) {
      const created: Message = await res.json();
      setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      setText('');
    }
    setSending(false);
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <button type="button" onClick={() => router.push('/sociallog/messages')} aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-sm font-semibold">Conversation</h1>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <Loader2 className="h-6 w-6 animate-spin" />}
        {messages.map((m) => {
          const isMine = m.senderId === profile?.id;
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-0.5 text-[10px] opacity-70">
                  {formatDistanceToNowStrict(new Date(m.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 border-t p-4">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
        />
        <Button size="icon" onClick={handleSend} disabled={sending || !text.trim()}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(sociallog)/sociallog/messages/[threadId]"
git commit -m "feat(sociallog): build the thread view with Realtime message delivery"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full typecheck, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed with no new errors.

- [ ] **Step 2: Manual smoke test**

Run `npm run dev`, log in, open `/sociallog/messages`.
Expected: the seeded welcome DM thread from Phase 2 (`burnlog_official`) appears in the list with its last message preview; tapping it opens the thread showing both seeded messages; tapping the pencil icon opens `NewMessageDialog`, searching a demo username and selecting it creates/opens a thread; sending a message appears immediately in your own view and — opened in a second browser/incognito session logged in as the other participant (or watched via Supabase Studio's table editor while sending) — arrives via Realtime without a page refresh; attempting to message a persona with `whoCanMessage` set to `none` (none are seeded that way, so this needs manually flipping one demo persona's setting via SQL to `update social_profile_settings set "whoCanMessage" = 'none' where "profileId" = '<a persona id>'` and retrying) shows the 403 error text.

- [ ] **Step 3: Reset any test state**

If you changed a demo persona's `whoCanMessage` value while verifying, set it back to `'everyone'` via SQL. If you started real test conversations, leave or delete them as you prefer.
