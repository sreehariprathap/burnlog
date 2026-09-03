# IntelLog Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild IntelLog's single-thread AI widget into a ChatGPT/Claude-style multi-thread chat: a thread list, a full chat screen with an OpenRouter-backed model picker (live list + free-text custom model IDs), and per-thread model memory.

**Architecture:** Extend the existing `IntelChatThread`/`IntelChatMessage` Prisma models to support many threads per profile plus a per-thread `modelId`. Add five new API routes under `/api/intellog/chat/` (list threads, delete thread, create+send to a new thread, get/send within an existing thread, list OpenRouter models) built on the existing `assembleProfileContext` / `getModel` / `runAiJob` helpers. Add a two-tab in-app nav to IntelLog (Dashboard | Chat, the existing suggestion feed is untouched) and three new client components (model picker, prompt bar, thread view) plus three new pages (thread list, new chat, existing chat).

**Tech Stack:** Next.js 15 App Router, Prisma + Supabase (service-role client in API routes, no RLS on these tables), `openai` SDK pointed at OpenRouter (`lib/ai/openrouter.ts`), SWR for client data fetching, Vitest for pure-function unit tests (this codebase has no component/route tests — UI and route work is verified manually against the dev server, matching existing convention).

**Spec:** `docs/superpowers/specs/2026-09-03-intellog-chat-design.md`

## Global Constraints

- Every API route must resolve the caller's `profileId` via `getMyProfileId(admin, user.id)` (from `lib/homelog/serverAuth.ts`) after checking `supabase.auth.getUser()`, exactly as the existing routes in this codebase do — copy that boilerplate, don't invent a new auth helper.
- Every thread-scoped route must verify the thread's `profileId` matches the caller's before reading/writing it, returning 404 otherwise (never 403 — this codebase's convention, see `app/api/moneylog/assets/[id]/route.ts`, is to say "not found" for both "doesn't exist" and "not yours").
- Dynamic route params are `Promise`-wrapped in this Next.js version: `{ params }: { params: Promise<{ threadId: string }> }`, then `const { threadId } = await params;`.
- No RLS policies exist for `intel_chat_threads` / `intel_chat_messages` — all access goes through `createServiceRoleClient()` inside API routes. Do not add client-side direct Supabase queries against these tables.
- Client components fetch through `apiFetch` (`lib/apiFetch.ts`), never raw `fetch`, so network/error toasts stay consistent with the rest of the app.
- No new npm dependencies — build the model picker's dropdown/search UI with plain React state + a document `mousedown`/`Escape` listener (see `components/GlobalSearch.tsx` for the closest existing pattern), not a new popover/combobox library.
- Match existing visual conventions: bottom nav pill styling from `components/BottomNav.tsx` / `components/SocialLogBottomNav.tsx`, chat bubble styling from `components/AppSwitcherChat.tsx`, delete confirmation via `window.confirm(...)` (see e.g. `app/(tasklog)/tasklog/plan/page.tsx`), relative timestamps via `formatRelative` (`lib/format.ts`).

---

## Task 1: Prisma schema + migration for multi-thread support

**Files:**
- Modify: `prisma/schema.prisma` (the `IntelChatThread` model, around line 469)
- Create: `prisma/migrations/20260903210000_intellog_chat_multithread/migration.sql`

**Interfaces:**
- Produces: `IntelChatThread` now has `title String?`, `modelId String?`, `updatedAt DateTime` (auto-updated), and no longer has a unique constraint on `profileId`. Every later task that queries `intel_chat_threads` relies on these columns existing and on `profileId` no longer being unique.

- [ ] **Step 1: Update the Prisma model**

In `prisma/schema.prisma`, replace the existing `IntelChatThread` model with:

```prisma
/// one AI chat thread per conversation — a profile can have many (IntelLog chat)
model IntelChatThread {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @db.Uuid
  title     String?
  modelId   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt

  messages IntelChatMessage[]

  @@index([profileId, updatedAt])
  @@map("intel_chat_threads")
}
```

(This replaces the old version that had `profileId String @unique @db.Uuid` and no `title`/`modelId`/`updatedAt`.)

- [ ] **Step 2: Write the migration SQL by hand**

This repo's migrations are committed as hand-authored/generated SQL files (see
`prisma/migrations/20260903045327_add_intellog_chat/migration.sql` for the original
table). Create the directory and file:

`prisma/migrations/20260903210000_intellog_chat_multithread/migration.sql`:

```sql
-- DropIndex
DROP INDEX "intel_chat_threads_profileId_key";

-- AlterTable
ALTER TABLE "intel_chat_threads"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "modelId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "intel_chat_threads_profileId_updatedAt_idx" ON "intel_chat_threads"("profileId", "updatedAt");
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes without error, prints "Generated Prisma Client".

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260903210000_intellog_chat_multithread
git commit -m "feat(intellog): add multi-thread chat schema (title, modelId, updatedAt)"
```

---

## Task 2: Thread title truncation helper

**Files:**
- Create: `lib/intellog/chatThreads.ts`
- Test: `lib/intellog/chatThreads.test.ts`

**Interfaces:**
- Produces: `truncateTitle(message: string, maxLen?: number): string` — used by the `/api/intellog/chat/new` route (Task 8) to derive a thread's title from its first message.

- [ ] **Step 1: Write the failing test**

`lib/intellog/chatThreads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { truncateTitle } from './chatThreads';

describe('truncateTitle', () => {
  it('returns short messages unchanged', () => {
    expect(truncateTitle('How many calories did I eat today?')).toBe('How many calories did I eat today?');
  });

  it('collapses internal whitespace and trims', () => {
    expect(truncateTitle('  hello   world  ')).toBe('hello world');
  });

  it('truncates at the last word boundary before maxLen and appends an ellipsis', () => {
    const message = 'This is a fairly long message that should definitely get truncated at some point soon';
    const result = truncateTitle(message, 40);
    expect(result.length).toBeLessThanOrEqual(41); // 40 + ellipsis char
    expect(result.endsWith('…')).toBe(true);
    expect(message.startsWith(result.slice(0, -1).trimEnd())).toBe(true);
  });

  it('hard-cuts at maxLen when there is no space to break on', () => {
    const message = 'a'.repeat(80);
    const result = truncateTitle(message, 40);
    expect(result).toBe('a'.repeat(40) + '…');
  });

  it('defaults maxLen to 60', () => {
    const message = 'b'.repeat(100);
    const result = truncateTitle(message);
    expect(result).toBe('b'.repeat(60) + '…');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/intellog/chatThreads.test.ts`
Expected: FAIL — `Cannot find module './chatThreads'`.

- [ ] **Step 3: Implement**

`lib/intellog/chatThreads.ts`:

```ts
// lib/intellog/chatThreads.ts

/**
 * Derives a chat thread's list-view title from its first message: collapse
 * whitespace, then trim to maxLen at the last word boundary (falling back to
 * a hard cut if the first "word" alone exceeds maxLen), appending an
 * ellipsis whenever anything was cut.
 */
export function truncateTitle(message: string, maxLen = 60): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;

  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace === -1 ? slice : slice.slice(0, lastSpace);
  return `${cut}…`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/intellog/chatThreads.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/intellog/chatThreads.ts lib/intellog/chatThreads.test.ts
git commit -m "feat(intellog): add chat thread title truncation helper"
```

---

## Task 3: OpenRouter models list (shaping + cache)

**Files:**
- Create: `lib/intellog/openrouterModels.ts`
- Test: `lib/intellog/openrouterModels.test.ts`

**Interfaces:**
- Produces: `interface OpenRouterModel { id: string; name: string }`, `mapOpenRouterModels(raw: unknown): OpenRouterModel[]`, `getModelsList(fetchImpl?: typeof fetch, now?: () => number): Promise<OpenRouterModel[]>`, `__resetModelsCacheForTests(): void`. Used by the `/api/intellog/chat/models` route (Task 5) and, via that route's response shape, by the model picker component (Task 12).

- [ ] **Step 1: Write the failing test**

`lib/intellog/openrouterModels.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapOpenRouterModels, getModelsList, __resetModelsCacheForTests } from './openrouterModels';

describe('mapOpenRouterModels', () => {
  it('maps id/name pairs from the OpenRouter { data: [...] } shape', () => {
    const raw = { data: [{ id: 'openai/gpt-5', name: 'GPT-5' }, { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5' }] };
    expect(mapOpenRouterModels(raw)).toEqual([
      { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5' },
      { id: 'openai/gpt-5', name: 'GPT-5' },
    ]);
  });

  it('sorts alphabetically by name', () => {
    const raw = { data: [{ id: 'z/z', name: 'Zeta' }, { id: 'a/a', name: 'Alpha' }] };
    expect(mapOpenRouterModels(raw).map((m) => m.id)).toEqual(['a/a', 'z/z']);
  });

  it('falls back to id as the name when name is missing or blank', () => {
    const raw = { data: [{ id: 'some/model' }, { id: 'other/model', name: '  ' }] };
    expect(mapOpenRouterModels(raw)).toEqual([
      { id: 'other/model', name: 'other/model' },
      { id: 'some/model', name: 'some/model' },
    ]);
  });

  it('skips entries with no string id and returns [] for malformed input', () => {
    expect(mapOpenRouterModels({ data: [{ name: 'no id' }, null, 42] })).toEqual([]);
    expect(mapOpenRouterModels(null)).toEqual([]);
    expect(mapOpenRouterModels({})).toEqual([]);
    expect(mapOpenRouterModels({ data: 'not an array' })).toEqual([]);
  });
});

describe('getModelsList', () => {
  beforeEach(() => {
    __resetModelsCacheForTests();
  });

  it('fetches and returns the mapped list on first call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }),
    });
    const result = await getModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    expect(result).toEqual([{ id: 'a/a', name: 'Alpha' }]);
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
  });

  it('serves from cache within the TTL without re-fetching', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }),
    });
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 1000 + 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL (1 hour) has elapsed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }),
    });
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    await getModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stale cache when a re-fetch fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'a/a', name: 'Alpha' }] }) })
      .mockRejectedValueOnce(new Error('network down'));
    const first = await getModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    const second = await getModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(second).toEqual(first);
  });

  it('returns [] when the first-ever fetch fails (no cache to fall back to)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await getModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/intellog/openrouterModels.test.ts`
Expected: FAIL — `Cannot find module './openrouterModels'`.

- [ ] **Step 3: Implement**

`lib/intellog/openrouterModels.ts`:

```ts
// lib/intellog/openrouterModels.ts

export interface OpenRouterModel {
  id: string;
  name: string;
}

/**
 * Shapes OpenRouter's `GET /api/v1/models` response ({ data: [{id, name, ...}] })
 * into a minimal, sorted list for the model picker. Tolerant of malformed/missing
 * fields since it's fed straight from an external API response.
 */
export function mapOpenRouterModels(raw: unknown): OpenRouterModel[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { data?: unknown }).data)) {
    return [];
  }

  const models: OpenRouterModel[] = [];
  for (const entry of (raw as { data: unknown[] }).data) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !id) continue;
    const rawName = (entry as { name?: unknown } | null)?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;
    models.push({ id, name });
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { data: OpenRouterModel[]; fetchedAt: number } | null = null;

/**
 * Fetches the live OpenRouter model list, cached in-memory for CACHE_TTL_MS
 * so the /models route isn't hitting OpenRouter on every open. On a failed
 * fetch, serves the stale cache if one exists, else returns [] — the model
 * picker's free-text custom-model input still works either way.
 */
export async function getModelsList(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<OpenRouterModel[]> {
  if (cache && now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
    const json = await res.json();
    const models = mapOpenRouterModels(json);
    cache = { data: models, fetchedAt: now() };
    return models;
  } catch (err) {
    if (cache) return cache.data;
    console.error('getModelsList: fetch failed and no cache available', err);
    return [];
  }
}

/** Test-only: clears the module-level cache between test cases. */
export function __resetModelsCacheForTests(): void {
  cache = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/intellog/openrouterModels.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/intellog/openrouterModels.ts lib/intellog/openrouterModels.test.ts
git commit -m "feat(intellog): add OpenRouter model list fetch + cache"
```

---

## Task 4: Shared chat-send helper (system prompt + AI call)

**Files:**
- Create: `lib/intellog/chatSend.ts`
- Test: `lib/intellog/chatSend.test.ts`
- Modify: `app/api/intellog/chat/route.ts` — delete this file at the end of this task (its logic is fully absorbed into `chatSend.ts` and the new routes built in Tasks 5-9; leaving it in place would mean two competing implementations of `buildSystemPrompt`)

**Interfaces:**
- Consumes: `ProfileAppContext` type and `assembleProfileContext` from `./chatContext` (unchanged, already exists); `getModel` from `@/lib/ai/modelConfig` (unchanged); `runAiJob`, `AiRouteError` from `@/lib/ai/jobs` (unchanged); `client` from `@/lib/ai/openrouter` (unchanged).
- Produces: `buildSystemPrompt(appContexts: ProfileAppContext[]): string` and `async function generateChatReply(admin: SupabaseClient, profileId: string, systemPrompt: string, history: {role: 'user'|'assistant'; content: string}[], model: string): Promise<string>` (throws `AiRouteError` on failure). Both are used by the `/api/intellog/chat/new` route (Task 8) and the `/api/intellog/chat/[threadId]` route (Task 9).

- [ ] **Step 1: Write the failing test**

`lib/intellog/chatSend.test.ts` (covers the pure `buildSystemPrompt` function only —
`generateChatReply` makes a real network call via the OpenRouter SDK and is exercised
manually through the API routes in later tasks, consistent with how this codebase has
no route-level or network-calling unit tests elsewhere):

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './chatSend';
import type { ProfileAppContext } from './chatContext';

describe('buildSystemPrompt', () => {
  it('returns a generic no-history prompt when there are no app contexts', () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain('LogBook');
    expect(prompt).toContain('no activity history yet');
  });

  it('includes each app, its metrics, and cohort percentiles when present', () => {
    const contexts: ProfileAppContext[] = [
      {
        app: 'burnlog',
        metrics: { workoutsThisWeek: 3, caloriesBurned: 1200 },
        cohort: { workoutsThisWeek: { p25: 1, p50: 2, p75: 4 } },
      },
    ];
    const prompt = buildSystemPrompt(contexts);
    expect(prompt).toContain('burnlog:');
    expect(prompt).toContain('workoutsThisWeek: 3 (peers: p25=1, p50=2, p75=4)');
    expect(prompt).toContain('caloriesBurned: 1200');
  });

  it('omits the cohort suffix for metrics with no matching cohort stat', () => {
    const contexts: ProfileAppContext[] = [{ app: 'tasklog', metrics: { tasksCompleted: 5 }, cohort: {} }];
    const prompt = buildSystemPrompt(contexts);
    expect(prompt).toContain('tasksCompleted: 5');
    expect(prompt).not.toContain('tasksCompleted: 5 (peers');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/intellog/chatSend.test.ts`
Expected: FAIL — `Cannot find module './chatSend'`.

- [ ] **Step 3: Implement**

`lib/intellog/chatSend.ts` (this is `app/api/intellog/chat/route.ts`'s existing
`buildSystemPrompt` moved verbatim, plus a new `generateChatReply` that wraps the
existing `runAiJob`/OpenRouter-call block from that same file's `POST` handler so
it's shared between the two routes that need it):

```ts
// lib/intellog/chatSend.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { client } from '@/lib/ai/openrouter';
import type { ProfileAppContext } from './chatContext';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildSystemPrompt(appContexts: ProfileAppContext[]): string {
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

/**
 * Calls the given model with the system prompt + conversation history, logging
 * the call as an ai_jobs row via runAiJob. Throws AiRouteError (with a status
 * code) on any failure — callers map that back to an HTTP response.
 */
export async function generateChatReply(
  admin: SupabaseClient,
  profileId: string,
  systemPrompt: string,
  history: ChatHistoryMessage[],
  model: string
): Promise<string> {
  return runAiJob(
    admin,
    profileId,
    { jobType: 'intellog-chat', app: 'intellog', model },
    { message: history[history.length - 1]?.content },
    async () => {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
      });
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new AiRouteError('AI returned no response', 502);
      return content;
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/intellog/chatSend.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Delete the old single-thread route**

`app/api/intellog/chat/route.ts` is superseded by Tasks 5-9 (its `GET`/`POST` had no
thread id — that shape is gone). Delete it now so it can't be confused with the new
routes; `AppSwitcherChat.tsx` (Task 10) is what currently calls it, and Task 10 repoints
it at the new routes in the same change, so there's a brief window in this task where
`AppSwitcherChat.tsx` calls a route that no longer exists — that's fine, it's fixed two
tasks later in the same plan before anything is deployed.

```bash
rm app/api/intellog/chat/route.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/intellog/chatSend.ts lib/intellog/chatSend.test.ts
git add app/api/intellog/chat/route.ts
git commit -m "refactor(intellog): extract shared chat system-prompt + send helper"
```

---

## Task 5: `GET /api/intellog/chat/models`

**Files:**
- Create: `app/api/intellog/chat/models/route.ts`

**Interfaces:**
- Consumes: `getModelsList` from `@/lib/intellog/openrouterModels` (Task 3).
- Produces: `GET /api/intellog/chat/models` → `200 { models: { id: string; name: string }[] }`. Used by the model picker component (Task 12).

- [ ] **Step 1: Implement**

`app/api/intellog/chat/models/route.ts`:

```ts
// app/api/intellog/chat/models/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getModelsList } from '@/lib/intellog/openrouterModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const models = await getModelsList();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('intellog chat models GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually against the dev server**

Run: `npm run dev` (in a background terminal if not already running)
Then, while logged in via the browser (so the auth cookie is set), open
`http://localhost:3000/api/intellog/chat/models` directly, or from the browser
devtools console on any page of the app run:
`fetch('/api/intellog/chat/models').then(r => r.json()).then(console.log)`
Expected: `{ models: [ { id: "...", name: "..." }, ... ] }` with a few hundred entries.

- [ ] **Step 3: Commit**

```bash
git add app/api/intellog/chat/models/route.ts
git commit -m "feat(intellog): add GET /api/intellog/chat/models route"
```

---

## Task 6: `GET /api/intellog/chat/threads` (list)

**Files:**
- Create: `app/api/intellog/chat/threads/route.ts`

**Interfaces:**
- Consumes: `getMyProfileId` from `@/lib/homelog/serverAuth`, `createServiceRoleClient` from `@/lib/supabase/serviceRole`, `createClient` from `@/lib/supabase/server`.
- Produces: `GET /api/intellog/chat/threads` → `200 { threads: { id: string; title: string | null; modelId: string | null; updatedAt: string }[] }`, ordered `updatedAt` desc. Used by the thread list page (Task 15).

- [ ] **Step 1: Implement**

`app/api/intellog/chat/threads/route.ts`:

```ts
// app/api/intellog/chat/threads/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

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

    const { data, error } = await admin
      .from('intel_chat_threads')
      .select('id, title, modelId, updatedAt')
      .eq('profileId', profileId)
      .order('updatedAt', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ threads: data ?? [] });
  } catch (error) {
    console.error('intellog chat threads GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually**

Run the dev server, log in, hit `/api/intellog/chat/threads` from the browser console
the same way as Task 5's step 2.
Expected: `{ threads: [] }` (no threads exist yet at this point in the plan).

- [ ] **Step 3: Commit**

```bash
git add app/api/intellog/chat/threads/route.ts
git commit -m "feat(intellog): add GET /api/intellog/chat/threads route"
```

---

## Task 7: `DELETE /api/intellog/chat/threads/[threadId]`

**Files:**
- Create: `app/api/intellog/chat/threads/[threadId]/route.ts`

**Interfaces:**
- Produces: `DELETE /api/intellog/chat/threads/[threadId]` → `200 { ok: true }` on success, `404 { error: 'Thread not found' }` if missing or not owned. Used by the thread list page (Task 15).

- [ ] **Step 1: Implement**

`app/api/intellog/chat/threads/[threadId]/route.ts`:

```ts
// app/api/intellog/chat/threads/[threadId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function DELETE(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
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

    const { data: thread } = await admin
      .from('intel_chat_threads')
      .select('id, profileId')
      .eq('id', threadId)
      .maybeSingle();
    if (!thread || thread.profileId !== profileId) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const { error } = await admin.from('intel_chat_threads').delete().eq('id', threadId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('intellog chat thread DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually**

This route needs a real thread to delete — full manual verification happens once
Task 8 exists (which creates threads). For now, confirm it at least compiles and
returns a clean 404 for a made-up id:
`fetch('/api/intellog/chat/threads/00000000-0000-0000-0000-000000000000', { method: 'DELETE' }).then(r => r.json()).then(console.log)`
Expected: `{ error: 'Thread not found' }` with a 404 status (check `r.status` too if curious).

- [ ] **Step 3: Commit**

```bash
git add "app/api/intellog/chat/threads/[threadId]/route.ts"
git commit -m "feat(intellog): add DELETE /api/intellog/chat/threads/[threadId] route"
```

---

## Task 8: `POST /api/intellog/chat/new` (create thread + first message)

**Files:**
- Create: `app/api/intellog/chat/new/route.ts`

**Interfaces:**
- Consumes: `truncateTitle` (Task 2), `buildSystemPrompt` + `generateChatReply` (Task 4), `assembleProfileContext` from `./chatContext` (existing), `getModel` from `@/lib/ai/modelConfig` (existing).
- Produces: `POST /api/intellog/chat/new` with body `{ message: string; model?: string }` → `200 { threadId: string; message: { id: string; role: 'assistant'; content: string; createdAt: string } }`. Used by `ChatThreadView` (Task 14) when sending the first message of a not-yet-created thread.

- [ ] **Step 1: Implement**

`app/api/intellog/chat/new/route.ts`:

```ts
// app/api/intellog/chat/new/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { assembleProfileContext } from '@/lib/intellog/chatContext';
import { buildSystemPrompt, generateChatReply, type ChatHistoryMessage } from '@/lib/intellog/chatSend';
import { truncateTitle } from '@/lib/intellog/chatThreads';
import { getModel } from '@/lib/ai/modelConfig';
import { AiRouteError } from '@/lib/ai/jobs';

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
    const { message, model } = body as { message?: string; model?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    const trimmedMessage = message.trim();

    const { data: thread, error: threadError } = await admin
      .from('intel_chat_threads')
      .insert({ profileId, title: truncateTitle(trimmedMessage), modelId: model ?? null })
      .select('id')
      .single();
    if (threadError) throw threadError;
    const threadId = thread.id as string;

    const { error: insertUserError } = await admin
      .from('intel_chat_messages')
      .insert({ threadId, role: 'user', content: trimmedMessage });
    if (insertUserError) throw insertUserError;

    const effectiveModel = model ?? (await getModel(admin, 'intellog-chat'));
    const { appContexts } = await assembleProfileContext(admin, profileId);
    const systemPrompt = buildSystemPrompt(appContexts);
    const history: ChatHistoryMessage[] = [{ role: 'user', content: trimmedMessage }];

    try {
      const reply = await generateChatReply(admin, profileId, systemPrompt, history, effectiveModel);

      const { data: assistantMessage, error: insertAssistantError } = await admin
        .from('intel_chat_messages')
        .insert({ threadId, role: 'assistant', content: reply })
        .select('id, role, content, createdAt')
        .single();
      if (insertAssistantError) throw insertAssistantError;

      await admin.from('intel_chat_threads').update({ updatedAt: new Date().toISOString() }).eq('id', threadId);

      return NextResponse.json({ threadId, message: assistantMessage });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message, threadId }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('intellog chat new POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

Note: on an `AiRouteError` (the AI call itself failed), the thread and the user's
message are still persisted and `threadId` is still returned in the error body — the
client can still navigate to the real thread and retry sending from there, rather than
losing the user's typed message into a thread that was never created.

- [ ] **Step 2: Verify manually**

With the dev server running and logged in, from the browser console:
```js
fetch('/api/intellog/chat/new', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'What have I been up to lately?' }),
}).then(r => r.json()).then(console.log)
```
Expected: `{ threadId: "<uuid>", message: { id, role: "assistant", content, createdAt } }`.
Then re-run the Task 6 verification (`GET /api/intellog/chat/threads`) and confirm the
new thread now appears with a truncated title.

- [ ] **Step 3: Commit**

```bash
git add app/api/intellog/chat/new/route.ts
git commit -m "feat(intellog): add POST /api/intellog/chat/new route"
```

---

## Task 9: `GET`/`POST /api/intellog/chat/[threadId]`

**Files:**
- Create: `app/api/intellog/chat/[threadId]/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/intellog/chat/[threadId]` → `200 { thread: { id: string; title: string | null; modelId: string | null }; messages: { id: string; role: 'user'|'assistant'; content: string; createdAt: string }[] }`, or `404 { error: 'Thread not found' }`.
  - `POST /api/intellog/chat/[threadId]` with body `{ message: string; model?: string }` → `200 { message: { id, role: 'assistant', content, createdAt } }`, or `404`.
  Both used by `ChatThreadView` (Task 14).

- [ ] **Step 1: Implement**

`app/api/intellog/chat/[threadId]/route.ts`:

```ts
// app/api/intellog/chat/[threadId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { assembleProfileContext } from '@/lib/intellog/chatContext';
import { buildSystemPrompt, generateChatReply, type ChatHistoryMessage } from '@/lib/intellog/chatSend';
import { getModel } from '@/lib/ai/modelConfig';
import { AiRouteError } from '@/lib/ai/jobs';

const HISTORY_LIMIT = 20;

type Admin = ReturnType<typeof createServiceRoleClient>;

async function loadOwnedThread(admin: Admin, threadId: string, profileId: string) {
  const { data } = await admin
    .from('intel_chat_threads')
    .select('id, title, modelId, profileId')
    .eq('id', threadId)
    .maybeSingle();
  if (!data || data.profileId !== profileId) return null;
  const { profileId: _discard, ...thread } = data;
  return thread;
}

export async function GET(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
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

    const thread = await loadOwnedThread(admin, threadId, profileId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const { data: messages, error } = await admin
      .from('intel_chat_messages')
      .select('id, role, content, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ thread, messages: messages ?? [] });
  } catch (error) {
    console.error('intellog chat thread GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
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

    const thread = await loadOwnedThread(admin, threadId, profileId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const body = await request.json();
    const { message, model } = body as { message?: string; model?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    const trimmedMessage = message.trim();

    if (model && model !== thread.modelId) {
      await admin.from('intel_chat_threads').update({ modelId: model }).eq('id', threadId);
    }

    const { error: insertUserError } = await admin
      .from('intel_chat_messages')
      .insert({ threadId, role: 'user', content: trimmedMessage });
    if (insertUserError) throw insertUserError;

    const { data: historyRows, error: historyError } = await admin
      .from('intel_chat_messages')
      .select('role, content')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyError) throw historyError;
    const history = ((historyRows ?? []) as ChatHistoryMessage[]).reverse();

    const effectiveModel = model ?? thread.modelId ?? (await getModel(admin, 'intellog-chat'));
    const { appContexts } = await assembleProfileContext(admin, profileId);
    const systemPrompt = buildSystemPrompt(appContexts);

    try {
      const reply = await generateChatReply(admin, profileId, systemPrompt, history, effectiveModel);

      const { data: assistantMessage, error: insertAssistantError } = await admin
        .from('intel_chat_messages')
        .insert({ threadId, role: 'assistant', content: reply })
        .select('id, role, content, createdAt')
        .single();
      if (insertAssistantError) throw insertAssistantError;

      await admin.from('intel_chat_threads').update({ updatedAt: new Date().toISOString() }).eq('id', threadId);

      return NextResponse.json({ message: assistantMessage });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('intellog chat thread POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

Note on `loadOwnedThread`: it fetches `profileId` alongside the fields it returns so
ownership can be checked in JS, then destructures it back out — Supabase's JS client
has no way to filter a query on a column while also excluding that column from the
result.

- [ ] **Step 2: Verify manually**

Using the `threadId` returned by Task 8's manual test:
```js
fetch('/api/intellog/chat/<threadId>').then(r => r.json()).then(console.log)
// → { thread: { id, title, modelId: null }, messages: [ {role:'user',...}, {role:'assistant',...} ] }

fetch('/api/intellog/chat/<threadId>', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'And what about last week?', model: 'openai/gpt-4o-mini' }),
}).then(r => r.json()).then(console.log)
// → { message: { id, role: 'assistant', content, createdAt } }
```
Then re-fetch the thread and confirm `thread.modelId` is now `"openai/gpt-4o-mini"`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/intellog/chat/[threadId]/route.ts"
git commit -m "feat(intellog): add GET/POST /api/intellog/chat/[threadId] route"
```

---

## Task 10: Repoint `AppSwitcherChat` at the new routes

**Files:**
- Modify: `components/AppSwitcherChat.tsx`

**Interfaces:**
- Consumes: `GET /api/intellog/chat/[threadId]` and `POST /api/intellog/chat/new` / `POST /api/intellog/chat/[threadId]` (Tasks 8, 9).

- [ ] **Step 1: Update the widget to track its own thread id in localStorage**

Replace the whole file with:

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

const THREAD_STORAGE_KEY = 'intellog-chat-thread-id';

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
  const threadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const storedId = typeof window !== 'undefined' ? window.localStorage.getItem(THREAD_STORAGE_KEY) : null;
      if (storedId) {
        const res = await apiFetch(`/api/intellog/chat/${storedId}`);
        if (res.ok) {
          const data = await res.json();
          threadIdRef.current = storedId;
          setMessages(data.messages ?? []);
        } else {
          window.localStorage.removeItem(THREAD_STORAGE_KEY);
        }
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
      const endpoint = threadIdRef.current
        ? `/api/intellog/chat/${threadIdRef.current}`
        : '/api/intellog/chat/new';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      if (data.threadId) {
        threadIdRef.current = data.threadId;
        window.localStorage.setItem(THREAD_STORAGE_KEY, data.threadId);
      }
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
```

The only behavioral changes from the previous version: it now reads/writes
`intellog-chat-thread-id` in `localStorage` instead of relying on the server to find
"the" thread for the profile, and a stale/deleted thread id (a 404 on load) is cleared
so it starts fresh instead of getting stuck.

- [ ] **Step 2: Verify manually**

With the dev server running, open the app switcher overlay, expand the chat widget,
send a message, confirm it replies. Reload the page, reopen the widget, confirm the
prior message is still there (loaded from the persisted thread). In the browser
devtools Application tab, check `localStorage` has `intellog-chat-thread-id` set.

- [ ] **Step 3: Commit**

```bash
git add components/AppSwitcherChat.tsx
git commit -m "fix(intellog): repoint AppSwitcherChat at the new multi-thread routes"
```

---

## Task 11: IntelLog two-tab nav bar

**Files:**
- Create: `components/IntelLogBottomNav.tsx`
- Modify: `app/(intellog)/layout.tsx`

**Interfaces:**
- Produces: `<IntelLogBottomNav />`, a fixed-position nav rendered on every IntelLog page. Used starting this task by the layout; the chat pages built in Tasks 15-16 render underneath it.

- [ ] **Step 1: Implement the nav bar**

`components/IntelLogBottomNav.tsx` (modeled directly on `components/SocialLogBottomNav.tsx`;
no `ConfigMenu` entry since IntelLog has no config page):

```tsx
// components/IntelLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { SparklesIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/intellog', label: 'Dashboard', Icon: SparklesIcon },
  { href: '/intellog/chat', label: 'Chat', Icon: MessageCircleIcon },
];

export function IntelLogBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/intellog' ? pathname === href : pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="intellog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Wire it into the layout**

Modify `app/(intellog)/layout.tsx`:

```tsx
// app/(intellog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';
import { IntelLogBottomNav } from '@/components/IntelLogBottomNav';

export default function IntelLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('intellog');
  }, []);

  return (
    <>
      {children}
      <IntelLogBottomNav />
    </>
  );
}
```

- [ ] **Step 3: Verify manually**

Run the dev server, navigate to `/intellog`. Confirm the two-tab pill nav appears at
the bottom with "Dashboard" active/highlighted. Note: clicking "Chat" will 404 until
Task 15 exists — that's expected at this point in the plan.

- [ ] **Step 4: Commit**

```bash
git add components/IntelLogBottomNav.tsx app/\(intellog\)/layout.tsx
git commit -m "feat(intellog): add Dashboard/Chat tab nav to IntelLog"
```

---

## Task 12: Model picker component

**Files:**
- Create: `components/intellog/IntelChatModelPicker.tsx`

**Interfaces:**
- Consumes: `OpenRouterModel` type from `@/lib/intellog/openrouterModels` (Task 3).
- Produces: `<IntelChatModelPicker models={OpenRouterModel[]} selectedModel={string | null} onSelect={(modelId: string) => void} />`. Used by the prompt bar (Task 13).

- [ ] **Step 1: Implement**

`components/intellog/IntelChatModelPicker.tsx`:

```tsx
// components/intellog/IntelChatModelPicker.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';

const MAX_VISIBLE_RESULTS = 50;

interface IntelChatModelPickerProps {
  models: OpenRouterModel[];
  /** null = no per-thread choice yet, falls back to the admin-configured default. */
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
}

export function IntelChatModelPicker({ models, selectedModel, onSelect }: IntelChatModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedName = useMemo(() => {
    if (!selectedModel) return 'Default model';
    return models.find((m) => m.id === selectedModel)?.name ?? selectedModel;
  }, [models, selectedModel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      : models;
    return base.slice(0, MAX_VISIBLE_RESULTS);
  }, [models, query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function selectAndClose(modelId: string) {
    onSelect(modelId);
    setOpen(false);
    setQuery('');
    setCustomMode(false);
    setCustomValue('');
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customValue.trim();
    if (!trimmed) return;
    selectAndClose(trimmed);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[160px] items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDownIcon className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border bg-popover p-2 shadow-lg">
          {customMode ? (
            <form onSubmit={submitCustom} className="flex flex-col gap-2">
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="e.g. mistralai/mixtral-8x7b"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setCustomMode(false)}>
                  Back
                </button>
                <button type="submit" className="font-medium text-primary" disabled={!customValue.trim()}>
                  Use this model
                </button>
              </div>
            </form>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching models</p>
                )}
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectAndClose(m.id)}
                    className={cn(
                      'flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                      m.id === selectedModel && 'bg-accent'
                    )}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.id}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className="mt-2 w-full rounded-md border border-dashed px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                Use custom model ID…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

This component has no page to render on yet — full manual verification happens in
Task 14 once `IntelChatPromptBar` embeds it. For now, confirm it type-checks:

Run: `npx tsc --noEmit`
Expected: no new errors referencing `IntelChatModelPicker.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/intellog/IntelChatModelPicker.tsx
git commit -m "feat(intellog): add searchable OpenRouter model picker component"
```

---

## Task 13: Prompt bar component

**Files:**
- Create: `components/intellog/IntelChatPromptBar.tsx`

**Interfaces:**
- Consumes: `<IntelChatModelPicker>` (Task 12), `OpenRouterModel` type (Task 3).
- Produces: `<IntelChatPromptBar models={OpenRouterModel[]} selectedModel={string | null} onModelChange={(id: string) => void} onSend={(text: string) => void} disabled={boolean} />`. Used by `ChatThreadView` (Task 14).

- [ ] **Step 1: Implement**

`components/intellog/IntelChatPromptBar.tsx`:

```tsx
// components/intellog/IntelChatPromptBar.tsx
'use client';

import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { IntelChatModelPicker } from './IntelChatModelPicker';
import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';

const MIN_HEIGHT_PX = 72;
const MAX_HEIGHT_PX = 300;

interface IntelChatPromptBarProps {
  models: OpenRouterModel[];
  selectedModel: string | null;
  onModelChange: (modelId: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}

export function IntelChatPromptBar({ models, selectedModel, onModelChange, onSend, disabled }: IntelChatPromptBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = `${MIN_HEIGHT_PX}px`;
    el.style.height = `${Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, el.scrollHeight))}px`;
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    requestAnimationFrame(resize);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t bg-background p-3">
      <div className="rounded-2xl border bg-muted/30 p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your apps, or anything else…"
          style={{ minHeight: MIN_HEIGHT_PX, maxHeight: MAX_HEIGHT_PX }}
          className="w-full resize-none bg-transparent px-1 py-1 text-sm outline-none"
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <IntelChatModelPicker models={models} selectedModel={selectedModel} onSelect={onModelChange} />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Same as Task 12 — this renders inside `ChatThreadView` (Task 14).

Run: `npx tsc --noEmit`
Expected: no new errors referencing `IntelChatPromptBar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/intellog/IntelChatPromptBar.tsx
git commit -m "feat(intellog): add kokonutui-style chat prompt bar component"
```

---

## Task 14: `ChatThreadView` component

**Files:**
- Create: `components/intellog/ChatThreadView.tsx`

**Interfaces:**
- Consumes: `<IntelChatPromptBar>` (Task 13), `GET /api/intellog/chat/models` (Task 5), `GET /api/intellog/chat/[threadId]` (Task 9), `POST /api/intellog/chat/new` (Task 8), `POST /api/intellog/chat/[threadId]` (Task 9).
- Produces: `<ChatThreadView threadId={string | null} />` (`null` = unsaved new-chat state). Used by the pages in Tasks 15-16.

- [ ] **Step 1: Implement**

`components/intellog/ChatThreadView.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify manually**

Full end-to-end verification happens once Tasks 15-16 give this component pages to
render on. For now:

Run: `npx tsc --noEmit`
Expected: no new errors referencing `ChatThreadView.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/intellog/ChatThreadView.tsx
git commit -m "feat(intellog): add ChatThreadView component"
```

---

## Task 15: Thread list page

**Files:**
- Create: `app/(intellog)/intellog/chat/page.tsx`

**Interfaces:**
- Consumes: `GET /api/intellog/chat/threads` (Task 6), `DELETE /api/intellog/chat/threads/[threadId]` (Task 7), `formatRelative` from `@/lib/format`.

- [ ] **Step 1: Implement**

`app/(intellog)/intellog/chat/page.tsx`:

```tsx
// app/(intellog)/intellog/chat/page.tsx
'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { PlusIcon, Trash2Icon, MessageCircleIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
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

export default function IntelLogChatListPage() {
  const { data, mutate } = useSWR<{ threads: ThreadRow[] }>('/api/intellog/chat/threads', fetcher);
  const threads = data?.threads ?? [];

  async function handleDelete(e: React.MouseEvent, threadId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
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
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run the dev server, navigate to `/intellog/chat`. Confirm the thread created in Task 8's
manual test appears with its truncated title and a relative timestamp. Click the trash
icon, confirm the browser confirm dialog appears and, on confirming, the thread
disappears from the list. Click the "+" button — should navigate to `/intellog/chat/new`
(404 until Task 16).

- [ ] **Step 3: Commit**

```bash
git add "app/(intellog)/intellog/chat/page.tsx"
git commit -m "feat(intellog): add chat thread list page"
```

---

## Task 16: New-chat and existing-chat pages

**Files:**
- Create: `app/(intellog)/intellog/chat/new/page.tsx`
- Create: `app/(intellog)/intellog/chat/[threadId]/page.tsx`

**Interfaces:**
- Consumes: `<ChatThreadView>` (Task 14).

- [ ] **Step 1: Implement the new-chat page**

`app/(intellog)/intellog/chat/new/page.tsx`:

```tsx
// app/(intellog)/intellog/chat/new/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { ChatThreadView } from '@/components/intellog/ChatThreadView';

export default function IntelLogNewChatPage() {
  return (
    <div className="flex h-dvh flex-col pb-20">
      <TopBar title="New chat" />
      <ChatThreadView threadId={null} />
    </div>
  );
}
```

- [ ] **Step 2: Implement the existing-thread page**

`app/(intellog)/intellog/chat/[threadId]/page.tsx`:

```tsx
// app/(intellog)/intellog/chat/[threadId]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { ChatThreadView } from '@/components/intellog/ChatThreadView';

export default function IntelLogChatThreadPage() {
  const params = useParams<{ threadId: string }>();

  return (
    <div className="flex h-dvh flex-col pb-20">
      <TopBar title="Chat" />
      <ChatThreadView threadId={params.threadId} />
    </div>
  );
}
```

(`pb-20` rather than IntelLog's usual `pb-24` — enough clearance for the fixed bottom
nav without adding extra dead space below the prompt bar, which already sits flush at
the bottom of its own flex column.)

- [ ] **Step 3: Verify manually**

Run the dev server. From `/intellog/chat`, click "+", land on `/intellog/chat/new`.
Type a message, send it — confirm the URL updates to `/intellog/chat/<new-id>` without
a page reload (check the message history stays intact through the URL swap), and the
assistant's reply appears. Go back to `/intellog/chat`, confirm the new thread is now
listed. Open it, send a follow-up message, confirm history loads and the reply appends.
Open the model picker, search for a model, select one, send a message, and confirm (via
the Task 9-style manual `GET` check, or just sending another message and checking it
still shows the picked model as selected) that the thread's `modelId` was persisted.
Try "Use custom model ID…", type an arbitrary OpenRouter model id, send — confirm it's
accepted as the selection.

- [ ] **Step 4: Commit**

```bash
git add "app/(intellog)/intellog/chat/new/page.tsx" "app/(intellog)/intellog/chat/[threadId]/page.tsx"
git commit -m "feat(intellog): add new-chat and existing-chat pages"
```

---

## Task 17: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm run test`
Expected: all tests pass, including the new `chatThreads.test.ts`, `openrouterModels.test.ts`, and `chatSend.test.ts` alongside every existing test in the repo (nothing in this plan touched shared code paths other than `IntelChatThread`'s shape and the chat routes, so no other suite should be affected).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end pass**

With the dev server running:
1. Open the app switcher overlay and confirm `AppSwitcherChat` still works standalone
   (send a message, reload, confirm history persists) — it has its own thread,
   independent of anything created via the `/intellog/chat` pages.
2. From `/intellog`, confirm the Dashboard tab (suggestion feed) still renders exactly
   as before — untouched by this plan.
3. Switch to the Chat tab, create two separate threads with different models, confirm
   both appear in the list with correct titles/timestamps, confirm switching between
   them shows the right history and the right selected model in the picker for each.
4. Delete one of them, confirm it's gone from the list and that navigating directly to
   its old URL shows the "This chat no longer exists" state.

- [ ] **Step 4: Final commit (only if any fixes were needed in this task)**

If steps 1-3 required any fixes, commit them now with a message describing what was
wrong. If everything passed cleanly, there's nothing to commit for this task.
