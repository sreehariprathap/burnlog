# IntelLog Chat — App Switcher AI Assistant — Design

## Problem

IntelLog's v1 spec (`docs/superpowers/specs/2026-09-02-intellog-design.md`)
deliberately deferred an interactive chat assistant, building the
`IntelSnapshot`/`IntelCohortStat` data layer so a future chat could reuse it
without rework. This spec is that fast-follow: a persistent, cross-app AI
chat surfaced directly in the app switcher, so it's reachable from anywhere
in LogBook without navigating to a dedicated page.

## Goals

- One persistent conversation thread per profile, reachable from the app
  switcher drawer, above the app grid.
- The assistant can answer questions using the user's real cross-app data
  (spending, streaks, tasks, etc.) via the same `IntelSnapshot`/
  `IntelCohortStat` retrieval context `intel:suggest` already assembles.
- Same privacy boundary as IntelLog v1: only the requesting profile's own
  snapshots, cohort stats only as `sampleSize >= 20` aggregate percentiles.
- Reuse existing infrastructure: `lib/ai/openrouter.ts` client, `runAiJob`
  logging, `AiModelSetting`/`getModel` (new `intellog-chat` slot, listed in
  the AdminLog AI Model Mapping page).

## Non-goals

- No multiple named threads / thread picker — one thread per profile.
- No streaming responses — request/response like every other AI route in
  this app (`AskAiInput`'s existing idle/thinking/done/error pattern
  already assumes a single awaited promise, not a token stream).
- No message editing/deletion — append-only thread.
- No unbounded context — only the last ~20 messages are sent to the model
  per turn, regardless of total thread length.

## Data model

```prisma
model IntelChatThread {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @unique @db.Uuid
  createdAt DateTime @default(now())

  messages IntelChatMessage[]
  @@map("intel_chat_threads")
}

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

`profileId @unique` on `IntelChatThread` enforces one thread per profile at
the schema level — the API's get-or-create is a plain upsert on that unique
column. `Profile` gains an inverse `intelChatThread IntelChatThread?`
relation. Requires a `prisma migrate dev` migration.

## API

`app/api/intellog/chat/route.ts`:

- **`GET`** — resolves the caller's profile, gets-or-creates their
  `IntelChatThread`, returns all messages ordered by `createdAt` ascending.
  Called once when the app switcher drawer opens.
- **`POST`** — body `{ message: string }`.
  1. Auth, resolve `profileId`.
  2. Get-or-create the thread; insert the new `user` message.
  3. Load the last 20 messages (including the one just inserted) for
     conversation history.
  4. Assemble context: this profile's most recent `IntelSnapshot` row per
     app (last 30 days) plus matching `IntelCohortStat` rows — same query
     shape `intel:suggest` already uses, factored into a shared helper
     (`lib/intellog/chatContext.ts`) so both call sites stay in sync rather
     than duplicating the snapshot/cohort assembly logic.
  5. Call `client.chat.completions.create` (from `lib/ai/openrouter.ts`)
     with `model: await getModel(supabase, 'intellog-chat')`, a system
     prompt built from the assembled context, and the message history as
     the conversation.
  6. Insert the assistant's reply as a new `assistant` message.
  7. Wrap steps 4-6 in `runAiJob(supabase, profileId, { jobType:
     'intellog-chat', app: 'intellog', model }, { message }, ...)` matching
     every other AI route's logging pattern.
  8. Return the assistant message.

`intellog-chat` is added to `AI_FEATURES` in `lib/ai/modelConfig.ts` (text
kind, default `openai/gpt-oss-20b:free`), so it automatically appears in the
AdminLog AI Model Mapping page — no separate admin UI needed for this
feature.

## UI

New `components/AppSwitcherChat.tsx`, mounted inside `AppSwitcher.tsx`'s
`DrawerContent`, between `DrawerHeader` and the app grid.

- Reuses `SiriOrb` and `SmoothButton` (the same primitives `AskAiInput`
  uses) so it's visually consistent, but is a distinct component — unlike
  `AskAiInput`, this renders a scrollable message list above the input
  since it's multi-turn, not single-shot.
- Collapsed by default: just the orb + a compact input row, so it doesn't
  push the app grid down when the switcher opens. Tapping the input (or the
  orb) expands the panel to show message history, matching `AskAiInput`'s
  existing dock/panel morph animation pattern.
- On the drawer's `open` transition to `true`, fetches `GET
  /api/intellog/chat` once to load existing history (skipped if already
  loaded this session).
- Sending a message: appends the user's message to the local message list
  immediately (optimistic), sets orb state to `thinking`, calls `POST`,
  appends the assistant's reply to the list on success and sets orb state
  to `done` (auto-resets to `idle` after the existing `SUCCESS_DURATION`),
  or sets `error` on failure.
- The message list auto-scrolls to the bottom on new messages.

## Error handling

- A failed `POST` (network error, non-2xx, thrown exception) sets the
  orb's `error` state (existing `AskAiInput` pattern) and leaves the user's
  message visible in the list with a small inline "failed to send — tap to
  retry" affordance; retrying re-sends the same text as a new `POST` rather
  than trying to resume server-side state.
- If the assistant's OpenRouter call itself fails inside `runAiJob`, the
  route returns a 502 and no `assistant` message is persisted — the thread
  is left exactly as it was before the failed turn (just the user's
  message), so a retry doesn't produce a duplicate or out-of-order reply.
- No special handling for malformed model output — chat replies are shown
  as plain text, not parsed as structured JSON like IntelLog's suggestion
  feed.

## Testing

- Unit test for `lib/intellog/chatContext.ts` (the shared snapshot/cohort
  assembly helper): given fake `IntelSnapshot`/`IntelCohortStat` rows,
  assert the assembled context object/string shape, reusing fixtures
  similar to `lib/intellog/cohort.test.ts`.
- Manual verification: open the app switcher, send a message, confirm a
  reply appears and both messages persist (row check or reload). Close and
  reopen the switcher, confirm history loads via `GET`. Ask a question
  whose answer depends on real per-app data (e.g. "what's my BurnLog
  streak") on an account with at least one day of `IntelSnapshot` history,
  confirm the reply reflects that data.
