# IntelLog Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, per-profile AI chat thread inside the app switcher drawer, with real cross-app data as retrieval context.

**Architecture:** Two new Prisma models (one thread per profile, append-only messages). A new `POST/GET /api/intellog/chat` route assembles context from `IntelSnapshot`/`IntelCohortStat` via a new shared helper (also adopted by the existing `intel-suggest` cron to avoid duplicating that assembly logic), calls OpenRouter, and persists both turns. A new `AppSwitcherChat` component (Siri orb + scrollable message list) mounts inside the existing `AppSwitcher` drawer, above the app grid.

**Tech Stack:** Next.js 15 API routes, Prisma/Postgres via Supabase, OpenRouter via the existing `lib/ai/openrouter.ts` client, Motion, vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-intellog-chat-design.md`

## Global Constraints

- One thread per profile — `IntelChatThread.profileId` is `@unique`.
- Only the last 20 messages are sent to the model per turn, regardless of total thread length.
- No streaming — request/response, matching every other AI route in this app.
- Same privacy boundary as IntelLog v1: only the caller's own `IntelSnapshot` rows; `IntelCohortStat` rows are aggregate-only.
- New AI feature slot is `'intellog-chat'`, text kind, default `openai/gpt-oss-20b:free` — added to `AI_FEATURES` in `lib/ai/modelConfig.ts` so it appears in the existing AdminLog AI Model Mapping page automatically.

---

### Task 1: Prisma schema — `IntelChatThread` + `IntelChatMessage`

**Files:**
- Modify: `prisma/schema.prisma` (after `IntelSuggestion`, ~line 425; `Profile` relations, ~line 56)

**Interfaces:**
- Produces: `IntelChatThread` (table `intel_chat_threads`), `IntelChatMessage` (table `intel_chat_messages`), `Profile.IntelChatThread` back-relation.

- [ ] **Step 1: Add the two models**

In `prisma/schema.prisma`, insert directly after the `IntelSuggestion` model's closing `}` (after `@@map("intel_suggestions")` / before `model Invite {`):

```prisma
/// one persistent chat thread per profile — the app-switcher AI assistant
model IntelChatThread {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @unique @db.Uuid
  createdAt DateTime @default(now())

  messages IntelChatMessage[]
  @@map("intel_chat_threads")
}

/// append-only message in an IntelChatThread
model IntelChatMessage {
  id        String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  thread    IntelChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  threadId  String          @db.Uuid
  role      String          // 'user' | 'assistant'
  content   String
  createdAt DateTime        @default(now())

  @@index([threadId, createdAt])
  @@map("intel_chat_messages")
}
```

- [ ] **Step 2: Add the `Profile` back-relation**

Next to the existing `IntelSnapshot   IntelSnapshot[]` / `IntelSuggestion IntelSuggestion[]` lines (~line 55-56), add:

```prisma
  IntelChatThread IntelChatThread?
```

- [ ] **Step 3: Run the migration**

```bash
npx prisma migrate dev --name add_intellog_chat
```

Expected: a new folder under `prisma/migrations/` is created and applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(intellog): add IntelChatThread and IntelChatMessage models"
```

---

### Task 2: Register the `intellog-chat` AI feature slot

**Files:**
- Modify: `lib/ai/modelConfig.ts`

**Interfaces:**
- Produces: `'intellog-chat'` becomes a valid `ModelSlot`, appears in `AI_FEATURES`, `DEFAULT_MODELS['intellog-chat']` is `openai/gpt-oss-20b:free`.

- [ ] **Step 1: Add the feature entry**

In `lib/ai/modelConfig.ts`, add a new entry to the `AI_FEATURES` array (anywhere in the list — order doesn't matter, but grouping it near `intel-suggest` keeps IntelLog features together):

```ts
  { slot: 'intellog-chat', label: 'App Switcher Chat', description: 'Answer questions in the persistent app-switcher AI chat, using the user\'s own cross-app data as context.', app: 'intellog', kind: 'text' },
```

- [ ] **Step 2: Verify it typechecks and shows up**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors — `ModelSlot` now includes `'intellog-chat'` since it's derived from `AI_FEATURES` via `as const satisfies`.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/modelConfig.ts
git commit -m "feat(intellog): register intellog-chat AI feature slot"
```

---

### Task 3: Shared context-assembly helper (TDD)

**Files:**
- Create: `lib/intellog/chatContext.ts`
- Test: `lib/intellog/chatContext.test.ts`

**Interfaces:**
- Consumes: `buildCohortKey` from `./cohort`; `SupabaseClient` from `@supabase/supabase-js`.
- Produces: `ProfileAppContext` interface, `buildAppContexts(snapshots, cohortStats): ProfileAppContext[]` (pure, testable), `assembleProfileContext(supabase, profileId, windowDays?): Promise<{ appContexts: ProfileAppContext[]; distinctDays: number }>` — the DB-fetching wrapper both the chat route and `intel-suggest` will call.

- [ ] **Step 1: Write the failing test for the pure aggregation function**

Create `lib/intellog/chatContext.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAppContexts, type SnapshotRow, type CohortStatRow } from './chatContext';

describe('buildAppContexts', () => {
  it('takes the latest snapshot per app', () => {
    const snapshots: SnapshotRow[] = [
      { app: 'burnlog', date: '2026-09-01', metrics: { workoutsPerWeek: 2 } },
      { app: 'burnlog', date: '2026-09-02', metrics: { workoutsPerWeek: 4 } },
    ];
    const result = buildAppContexts(snapshots, []);
    expect(result).toEqual([{ app: 'burnlog', metrics: { workoutsPerWeek: 4 }, cohort: {} }]);
  });

  it('attaches matching cohort stats by app and metric', () => {
    const snapshots: SnapshotRow[] = [{ app: 'moneylog', date: '2026-09-01', metrics: { budgetPct: 82 } }];
    const cohortStats: CohortStatRow[] = [
      { app: 'moneylog', metric: 'budgetPct', p25: 40, p50: 60, p75: 80 },
      { app: 'burnlog', metric: 'workoutsPerWeek', p25: 1, p50: 3, p75: 5 },
    ];
    const result = buildAppContexts(snapshots, cohortStats);
    expect(result).toEqual([
      { app: 'moneylog', metrics: { budgetPct: 82 }, cohort: { budgetPct: { p25: 40, p50: 60, p75: 80 } } },
    ]);
  });

  it('returns an empty array when there are no snapshots', () => {
    expect(buildAppContexts([], [])).toEqual([]);
  });

  it('handles multiple apps independently', () => {
    const snapshots: SnapshotRow[] = [
      { app: 'burnlog', date: '2026-09-01', metrics: { workoutsPerWeek: 4 } },
      { app: 'moneylog', date: '2026-09-01', metrics: { budgetPct: 82 } },
    ];
    const result = buildAppContexts(snapshots, []);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.app).sort()).toEqual(['burnlog', 'moneylog']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/intellog/chatContext.test.ts`
Expected: FAIL — `chatContext.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/intellog/chatContext.ts`:

```ts
// lib/intellog/chatContext.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCohortKey } from './cohort';

export interface SnapshotRow {
  app: string;
  date: string;
  metrics: Record<string, number>;
}

export interface CohortStatRow {
  app: string;
  metric: string;
  p25: number;
  p50: number;
  p75: number;
}

export interface ProfileAppContext {
  app: string;
  metrics: Record<string, number>;
  cohort: Record<string, { p25: number; p50: number; p75: number }>;
}

/**
 * Pure aggregation: latest snapshot metrics per app, with matching cohort
 * percentiles attached per metric. Rows are expected date-ascending (the
 * default Postgres order for these queries) so the last write per app wins.
 */
export function buildAppContexts(snapshots: SnapshotRow[], cohortStats: CohortStatRow[]): ProfileAppContext[] {
  const latestByApp = new Map<string, Record<string, number>>();
  for (const snap of snapshots) {
    latestByApp.set(snap.app, snap.metrics);
  }

  return Array.from(latestByApp.entries()).map(([app, metrics]) => ({
    app,
    metrics,
    cohort: Object.fromEntries(
      cohortStats
        .filter((c) => c.app === app)
        .map((c) => [c.metric, { p25: c.p25, p50: c.p50, p75: c.p75 }])
    ),
  }));
}

/**
 * Fetches this profile's last `windowDays` of snapshots plus today's
 * matching cohort stats, and assembles them via buildAppContexts. Shared by
 * the intel-suggest cron and the app-switcher chat route so both stay in
 * sync on what "context" means.
 */
export async function assembleProfileContext(
  supabase: SupabaseClient,
  profileId: string,
  windowDays = 30
): Promise<{ appContexts: ProfileAppContext[]; distinctDays: number }> {
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const [profileRes, snapshotsRes] = await Promise.all([
    supabase.from('profiles').select('age').eq('id', profileId).single(),
    supabase
      .from('intel_snapshots')
      .select('app, date, metrics')
      .eq('profileId', profileId)
      .gte('date', windowStart.toISOString().slice(0, 10)),
  ]);

  const snapshots = (snapshotsRes.data as SnapshotRow[]) || [];
  const distinctDays = new Set(snapshots.map((s) => s.date)).size;

  const { data: goalRow } = await supabase
    .from('fitness_goals')
    .select('goalType')
    .eq('profileId', profileId)
    .limit(1)
    .maybeSingle();

  const age = (profileRes.data as { age: number } | null)?.age ?? 30;
  const cohortKey = buildCohortKey((goalRow as { goalType: string } | null)?.goalType ?? null, age);

  const { data: cohortStats } = await supabase
    .from('intel_cohort_stats')
    .select('app, metric, p25, p50, p75')
    .eq('cohortKey', cohortKey)
    .eq('date', today.toISOString().slice(0, 10));

  return {
    appContexts: buildAppContexts(snapshots, (cohortStats as CohortStatRow[]) || []),
    distinctDays,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/intellog/chatContext.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/intellog/chatContext.ts lib/intellog/chatContext.test.ts
git commit -m "feat(intellog): add shared snapshot/cohort context assembly helper"
```

---

### Task 4: Refactor `intel-suggest` to use the shared helper

**Files:**
- Modify: `app/api/cron/intel-suggest/route.ts`

**Interfaces:**
- Consumes: `assembleProfileContext` from `@/lib/intellog/chatContext` (replaces the inline snapshot/cohort assembly).

- [ ] **Step 1: Replace the inline assembly with the shared helper**

In `app/api/cron/intel-suggest/route.ts`, replace the imports and the per-profile assembly block. Current imports:

```ts
import { generateIntelSuggestions, type SuggestionInput } from '@/lib/ai/intelSuggestions';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob } from '@/lib/ai/jobs';
import { buildCohortKey } from '@/lib/intellog/cohort';
```

become:

```ts
import { generateIntelSuggestions, type SuggestionInput } from '@/lib/ai/intelSuggestions';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob } from '@/lib/ai/jobs';
import { assembleProfileContext } from '@/lib/intellog/chatContext';
```

Remove the now-unused `goals`/`goalTypeByProfile` batch fetch (the shared helper fetches goal type per-profile internally) and the per-profile inline snapshot/cohort queries. Replace the body of the `for (const profile of profiles ?? [])` loop's try block, from the `const { data: snapshots, ...` line through the `const input: SuggestionInput[] = ...` line, with:

```ts
      const { appContexts, distinctDays } = await assembleProfileContext(supabase, profile.id);
      if (distinctDays < MIN_HISTORY_DAYS) {
        skipped += 1;
        continue;
      }

      const input: SuggestionInput[] = appContexts.map((ctx) => ({
        app: ctx.app,
        kind: ctx.app,
        metrics: ctx.metrics,
        cohort: ctx.cohort,
      }));
```

The rest of the loop (the `runAiJob` call and suggestion-insert block) is unchanged.

- [ ] **Step 2: Manual verification**

This route requires `CRON_SECRET` auth and touches real profile data — don't run it against production data casually. Instead, confirm it still typechecks and the diff is a pure refactor (no behavior change): `git diff app/api/cron/intel-suggest/route.ts` should show only the assembly logic moved, not the `MIN_HISTORY_DAYS` gate, the `runAiJob` call, or the suggestion-insert logic.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (this route has no direct unit tests, but `lib/intellog/cohort.test.ts` and the new `chatContext.test.ts` cover the logic it now delegates to).

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/intel-suggest/route.ts
git commit -m "refactor(intellog): use shared context helper in intel-suggest"
```

---

### Task 5: Chat API route — `GET` (load thread)

**Files:**
- Create: `app/api/intellog/chat/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `createServiceRoleClient` from `@/lib/supabase/serviceRole`, `getMyProfileId` from `@/lib/homelog/serverAuth` (existing shared auth-resolution pattern used by every other authenticated route this session).
- Produces: `GET /api/intellog/chat` → `{ messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }> }`.

- [ ] **Step 1: Write the route with a get-or-create helper and the GET handler**

```ts
// app/api/intellog/chat/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getOrCreateThread(admin: Admin, profileId: string): Promise<string> {
  const { data: existing } = await admin
    .from('intel_chat_threads')
    .select('id')
    .eq('profileId', profileId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from('intel_chat_threads')
    .insert({ profileId })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const threadId = await getOrCreateThread(admin, profileId);
    const { data: messages, error } = await admin
      .from('intel_chat_messages')
      .select('id, role, content, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ messages: messages ?? [] });
  } catch (error) {
    console.error('intellog chat GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verification**

Start the dev server, confirm `GET /api/intellog/chat` returns `401` unauthenticated:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/intellog/chat
```

Expected: `401`.

- [ ] **Step 3: Commit**

```bash
git add app/api/intellog/chat/route.ts
git commit -m "feat(intellog): add chat thread GET route"
```

---

### Task 6: Chat API route — `POST` (send message, get reply)

**Files:**
- Modify: `app/api/intellog/chat/route.ts`

**Interfaces:**
- Consumes: `assembleProfileContext` from `@/lib/intellog/chatContext`, `getModel` from `@/lib/ai/modelConfig`, `runAiJob` from `@/lib/ai/jobs`, `client` from `@/lib/ai/openrouter`.
- Produces: `POST /api/intellog/chat` body `{ message: string }` → `{ message: { id: string; role: 'assistant'; content: string; createdAt: string } }`.

- [ ] **Step 1: Add the system-prompt builder, message-history loader, and POST handler**

Append to `app/api/intellog/chat/route.ts`:

```ts
import { assembleProfileContext, type ProfileAppContext } from '@/lib/intellog/chatContext';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { client } from '@/lib/ai/openrouter';

const HISTORY_LIMIT = 20;

function buildSystemPrompt(appContexts: ProfileAppContext[]): string {
  if (appContexts.length === 0) {
    return `You are LogBook's cross-app AI assistant, embedded in the app switcher. This user has no
activity history yet across their apps (BurnLog, MoneyLog, TaskLog, TravelLog, LearnLog, HomeLog,
SocialLog, ShoppingLog) — answer helpfully and generally, and mention that once they log some
activity you'll be able to reference their real data.`;
  }

  const context = appContexts
    .map((ctx) => {
      const lines = Object.entries(ctx.metrics)
        .map(([metric, value]) => {
          const cohort = ctx.cohort[metric];
          const cohortText = cohort ? ` (peers: p25=${cohort.p25}, p50=${cohort.p50}, p75=${cohort.p75})` : '';
          return `  - ${metric}: ${value}${cohortText}`;
        })
        .join('\n');
      return `${ctx.app}:\n${lines}`;
    })
    .join('\n\n');

  return `You are LogBook's cross-app AI assistant, embedded in the app switcher. Answer the user's
questions using their own recent activity metrics below and, where given, anonymized peer
percentiles (never another individual's raw data). Be concise and specific. If asked about
something outside this data, say so rather than guessing.

${context}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { message } = body as { message?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const threadId = await getOrCreateThread(admin, profileId);

    const { error: insertUserError } = await admin
      .from('intel_chat_messages')
      .insert({ threadId, role: 'user', content: message.trim() });
    if (insertUserError) throw insertUserError;

    const { data: historyRows, error: historyError } = await admin
      .from('intel_chat_messages')
      .select('role, content')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyError) throw historyError;

    const history = ((historyRows ?? []) as { role: string; content: string }[]).reverse();

    const model = await getModel(admin, 'intellog-chat');
    const { appContexts } = await assembleProfileContext(admin, profileId);
    const systemPrompt = buildSystemPrompt(appContexts);

    try {
      const reply = await runAiJob(
        admin,
        profileId,
        { jobType: 'intellog-chat', app: 'intellog', model },
        { message },
        async () => {
          const completion = await client.chat.completions.create({
            model,
            temperature: 0.4,
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            ],
          });
          const content = completion.choices?.[0]?.message?.content;
          if (!content) throw new AiRouteError('AI returned no response', 502);
          return content;
        }
      );

      const { data: assistantMessage, error: insertAssistantError } = await admin
        .from('intel_chat_messages')
        .insert({ threadId, role: 'assistant', content: reply })
        .select('id, role, content, createdAt')
        .single();
      if (insertAssistantError) throw insertAssistantError;

      return NextResponse.json({ message: assistantMessage });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('intellog chat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

Note: per the spec's error-handling section, a failed AI call (no content returned) throws `AiRouteError('AI returned no response', 502)`, caught by the inner `try`/`catch` and mapped to a 502 response — matching the pattern every other AI route in this app already uses (e.g. `app/api/ai/estimate-workout-calories/route.ts`). Any other failure (a thrown network/DB error) falls through to the outer catch's generic 500. Either way, the user's message row (inserted just before) stays in the thread, but no `assistant` row is ever written, so a retry doesn't produce a duplicate or out-of-order reply.

- [ ] **Step 2: Manual verification**

With the dev server running and logged in (a real session cookie — this can't be curled anonymously), send a message from the browser console or a quick fetch:

```js
fetch('/api/intellog/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'What apps do I use?' }) }).then(r => r.json()).then(console.log)
```

Expected: `{ message: { id, role: 'assistant', content, createdAt } }`. Confirm via `GET /api/intellog/chat` afterward that both the user and assistant messages are present in order.

- [ ] **Step 3: Commit**

```bash
git add app/api/intellog/chat/route.ts
git commit -m "feat(intellog): add chat POST route with context-assembled reply"
```

---

### Task 7: `AppSwitcherChat` component

**Files:**
- Create: `components/AppSwitcherChat.tsx`

**Interfaces:**
- Consumes: `SiriOrb` (default export) from `@/components/smoothui/siri-orb`, `SmoothButton` (default export) from `@/components/smoothui/smooth-button`, `type AIState` from `@/components/smoothui/ai-core`, `apiFetch` from `@/lib/apiFetch`.
- Produces: `<AppSwitcherChat open={boolean} />` — self-contained (owns its own message state, fetch-on-open, and expand/collapse), matching the prop shape `AppSwitcher` will pass it (just `open`, so it knows when to fetch history and reset).

- [ ] **Step 1: Write the component**

```tsx
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
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-label="Toggle chat">
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json` and `npx eslint components/AppSwitcherChat.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AppSwitcherChat.tsx
git commit -m "feat(intellog): add AppSwitcherChat component"
```

---

### Task 8: Mount `AppSwitcherChat` in the app switcher drawer

**Files:**
- Modify: `components/AppSwitcher.tsx`

**Interfaces:**
- Consumes: `AppSwitcherChat` from `./AppSwitcherChat`.

- [ ] **Step 1: Import and mount it between the header and the app grid**

In `components/AppSwitcher.tsx`, add the import:

```tsx
import { AppSwitcherChat } from '@/components/AppSwitcherChat';
```

Insert it between `</DrawerHeader>` and the `<div className="grid grid-cols-4 ...">` block:

```tsx
        <DrawerHeader>
          <DrawerTitle>Apps</DrawerTitle>
        </DrawerHeader>
        <AppSwitcherChat open={open} />
        <div className="grid grid-cols-4 gap-4 p-4 pb-8 overflow-y-auto">
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, log in, open the app switcher (tap the app mark in the top bar). Confirm the chat dock appears above the app grid, expands on tap/focus, sending a message shows it immediately, and a reply appears shortly after. Close and reopen the switcher — confirm the same conversation is still there (loaded via `GET`).

- [ ] **Step 3: Commit**

```bash
git add components/AppSwitcher.tsx
git commit -m "feat(intellog): mount AppSwitcherChat in the app switcher drawer"
```

---

## Post-implementation

- Run `npx vitest run` once more after Task 8 to confirm nothing else regressed.
- Update `README.md`'s cross-cutting features section to mention the app-switcher AI chat.
- Update `[[project_feature_brainstorm_2026-09-02]]` memory: mark the "Cross-app AI assistant" idea's chat fast-follow as shipped once this is complete and pushed.
