# IntelLog Chat — Multi-Thread AI Chat with Model Picker

## Summary

Turn IntelLog's existing single-thread AI assistant into a full ChatGPT/Claude-style
chat surface: multiple conversations per user, a searchable model picker backed by
OpenRouter's live model list (plus free-text custom model IDs), and per-thread model
memory. The existing suggestion feed at `/intellog` is untouched and becomes the
"Dashboard" tab; chat becomes a second tab.

## Background

IntelLog already has working chat infrastructure:
- `IntelChatThread` / `IntelChatMessage` Prisma models (currently one thread per
  profile, enforced by `profileId @unique` on the thread).
- `/api/intellog/chat` (GET/POST) — single-thread history + send, using
  `getModel(admin, 'intellog-chat')` to resolve the model from `ai_model_settings`
  (an admin-wide default, not user-chosen).
- `AppSwitcherChat.tsx` — a small persistent widget embedded in the app switcher that
  talks to that route.
- `lib/ai/openrouter.ts`'s `client` (an `OpenAI` SDK instance pointed at OpenRouter) —
  reused for the new chat calls.

This spec adds multi-thread support and a real chat page/UI inside IntelLog, plus a
per-thread, user-chosen model (not just the admin default).

## Data model changes

`prisma/schema.prisma`:

```prisma
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

Changes from current: drop `@unique` on `profileId` (many threads per profile), add
`title`, `modelId`, `updatedAt` (bumped on every new message, drives list ordering).
`IntelChatMessage` is unchanged.

A new migration (`prisma migrate dev`) covers this. `intel_chat_threads` /
`intel_chat_messages` have no RLS policies today (all access goes through
`createServiceRoleClient()` inside API routes, never queried directly from the
client) — that stays true here, so `supabase/rls.sql` needs no changes.

## API routes

All routes require an authenticated user and resolve `profileId` via
`getMyProfileId`, same pattern as the current route. Every thread-scoped route
verifies the thread's `profileId` matches before reading/writing (404 otherwise).

- `GET /api/intellog/chat/threads` — list the caller's threads: `id, title, modelId,
  updatedAt`, ordered `updatedAt desc`.
- `DELETE /api/intellog/chat/threads/[threadId]` — delete a thread (messages cascade).
- `GET /api/intellog/chat/[threadId]` — that thread's messages, `createdAt asc`.
- `POST /api/intellog/chat/[threadId]` — body `{ message: string, model?: string }`.
  Inserts the user message, updates `thread.modelId` if `model` was passed, builds
  history + system prompt (reusing `assembleProfileContext` /
  `buildSystemPrompt` exactly as today), calls OpenRouter with
  `model ?? thread.modelId ?? await getModel(admin, 'intellog-chat')`, inserts +
  returns the assistant message, and bumps `thread.updatedAt`.
- `POST /api/intellog/chat/new` — body `{ message: string, model?: string }`. Creates
  a thread (`title` = first 60 chars of `message`, trimmed at a word boundary,
  `modelId` = `model ?? null`), then runs the same insert-history-call-insert flow as
  the `[threadId]` POST above. Returns `{ threadId, message }`. Existing empty
  threads are never created — a thread only exists once it has a first message.
- `GET /api/intellog/chat/models` — no auth requirement beyond being logged in; fetches
  `https://openrouter.ai/api/v1/models`, maps to `{ id, name }[]`, sorted by name,
  cached in an in-memory module-level variable for 1 hour (simple `{data, fetchedAt}`
  guard — no new infra). On fetch failure, serves the stale cache if present, else an
  empty array (the UI's free-text custom-model input still works either way).

The old `GET`/`POST /api/intellog/chat` (no thread id) is removed. `AppSwitcherChat.tsx`
is updated to:
1. Keep a `currentThreadId` in `localStorage` (key `intellog-chat-thread-id`).
2. On open, if it has an id, `GET /api/intellog/chat/[id]`; if that 404s (deleted from
   the chat page) or there's no stored id, treat as a fresh thread.
3. On first send with no thread yet, call `POST /api/intellog/chat/new` and store the
   returned `threadId`; subsequent sends use `POST /api/intellog/chat/[threadId]`.
No model picker in the widget — it keeps using the admin-default resolution (passes
no `model`), same behavior as today.

## IntelLog navigation

`app/(intellog)/layout.tsx` gains a small two-tab icon bar (visually modeled on
`BottomNav`: pill-shaped, centered, `fixed bottom-4`) with two entries — Dashboard
(`SparklesIcon`, links to `/intellog`) and Chat (`MessageCircleIcon`, links to
`/intellog/chat`) — active tab highlighted the same way `BottomNav` does it
(`layoutId` shared-layout pill). The dashboard page itself is not modified.

## Chat UI

New route group `app/(intellog)/intellog/chat/`:

- `page.tsx` — thread list. Fetches `GET .../threads`. Empty state mirrors the
  existing "no suggestions yet" card style. Each row: title (or "New chat" if title is
  somehow empty), relative time (`updatedAt`), a trash icon that calls `DELETE
  .../threads/[id]` with a confirm step. A floating "+" button (top-right, in the
  `TopBar` actions slot) routes to `/intellog/chat/new`.
- `[threadId]/page.tsx` and a `new` sibling route — both render the same
  `ChatThreadView` client component, parameterized by an optional `threadId`:
  - `threadId` present: loads history via `GET .../[threadId]` on mount.
  - `threadId` absent (the `new` route): starts with empty history, no thread yet.
  - Message list: same bubble styling as `AppSwitcherChat` (user right/primary,
    assistant left/muted), auto-scrolls to bottom on new message.
  - Bottom prompt bar (new `IntelChatPromptBar` component, styled after kokonutui's
    `ai-prompt`): auto-resizing `<textarea>` (72px–300px), Enter submits / Shift+Enter
    newline, a model-selector button+popover (search input over the
    `/api/intellog/chat/models` list, each row showing name; a "Use custom model ID"
    row at the bottom of the list opens a plain text field for typing an arbitrary
    OpenRouter model id), and a send button (disabled while empty or a request is
    in flight).
  - Model state: initialized from `thread.modelId` (or the admin default label,
    fetched once) when loading an existing thread; free-picked by the user
    otherwise. Selecting a model updates local state only — it's persisted to the
    thread by being included in the next `POST` body, matching how `model` already
    flows through the API.
  - On send from the `new` route: calls `POST .../new`, then does a client-side
    `router.replace('/intellog/chat/' + threadId)` so the URL and future sends target
    the real thread, without a full remount (history/messages already in state).

## Error handling

- Thread not found / not owned → 404 from the API; chat screen shows a small inline
  "This chat no longer exists" state with a link back to the thread list.
- OpenRouter/model call failure → same pattern already used in the existing route
  (`AiRouteError` → mapped status, generic 500 otherwise); UI shows the existing
  "failed to send, tap to retry" affordance from `AppSwitcherChat`, adapted into the
  new prompt bar.
- `/models` fetch failure → picker shows only the "custom model ID" option; no
  blocking error state, since chat remains usable.

## Testing

- `lib/intellog/chatContext.ts` / `cohort.ts` unit tests are unaffected (system
  prompt assembly logic doesn't change).
- New unit tests: thread title truncation (word-boundary trim at 60 chars), and the
  `/models` route's response-shaping + cache-fallback-on-failure logic (pure
  functions extracted so they're testable without a live OpenRouter call).
- Manual pass in dev server: create a thread via first message, verify it appears in
  the list with the right title; switch models mid-thread and confirm the next reply
  uses it; delete a thread; confirm `AppSwitcherChat` still works standalone (its own
  localStorage-tracked thread, independent of the chat page's list).

## Out of scope

- Renaming threads.
- AI-generated (vs. truncated-message) thread titles.
- Attachments/file upload in the prompt bar.
- Streaming responses (existing route is request/response; kept as-is).
