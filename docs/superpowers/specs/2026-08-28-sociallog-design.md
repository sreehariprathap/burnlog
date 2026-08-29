# SocialLog — Design

**Date:** 2026-08-28
**Status:** Approved design, pending spec review
**Parent effort:** Add a fifth sub-app "SocialLog" (a Twitter/Threads/Reddit/Instagram-style social layer) alongside BurnLog, LifeLog, TaskLog, HomeLog. This spec covers the full product (Dashboard feed, Search, Messages, Profile/Privacy); implementation is phased (see Phased Build Order).

## Goal

Give users a social space, in the same product, where they can:
- See a feed of posts and cross-app activity from people they follow (or a wider "For You" feed), vote and comment on posts.
- Search for users, topics (hashtags), and browse a reels grid of short video/photo posts.
- Send and receive 1:1 direct messages in real time.
- Manage a SocialLog-specific profile bio and privacy settings (private account, who can message me, whether my other-app activity shows up here) from the existing shared Profile page.

## Non-Goals (phase 1)

- Group chats (1:1 only for now).
- Reddit-style "communities" with membership/moderation — topics are lightweight Twitter-style hashtags, not subreddits.
- Wiring cross-app activity posting into every sub-app — only one real integration point is built as a proof of concept; the rest is available via a reusable helper for later.
- Push notifications for messages/likes/follows (out of scope; existing notification infra is untouched).
- A vote-decay cron job — Hot score is computed at query time.

## Decisions (locked during brainstorming)

1. **Content model:** Cross-app activity feed — feed is primarily built from activity across other sub-apps, plus original posts users create directly in SocialLog (hybrid content, not a fully standalone network).
2. **Topics:** Twitter-style hashtags/topics (lightweight, followable/filterable), not Reddit-style communities.
3. **Reels:** Real short video/photo posts users upload (not auto-generated cards).
4. **Messaging:** Realtime via Supabase Realtime, 1:1 only.
5. **Follow graph:** New standalone one-directional `SocialFollow` model — independent of the existing mutual `Friendship` model used by burnlog's friends/leaderboard feature.
6. **Feed ranking:** Upvote/downvote score with Hot/New/Top sort modes (Reddit-style).
7. **Media storage:** Supabase Storage, new `sociallog-media` bucket, same direct-client-upload pattern as the existing `avatars` bucket.
8. **Sequencing:** Full spec now, phased implementation (Foundation → Dashboard → Search → Messages).

## Architecture

### Route structure

Follows the existing sub-app convention exactly (see `app/(tasklog)/`, `app/(lifelog)/`): a URL-transparent route group wrapping a real `sociallog/` segment.

```
app/
  (sociallog)/
    layout.tsx                        # marks app="sociallog", adds `.app-sociallog` theme class, renders SocialLogBottomNav
    sociallog/
      page.tsx                        # Dashboard (feed)
      _components/                    # PostCard, FeedTabs, SortControl, ComposeBox, VoteButtons, CommentList, ActivityCard
      search/
        page.tsx                      # Search (Users / Topics / Reels)
        _components/                  # SearchTabs, UserResultRow, TopicResultRow, ReelsGrid
      messages/
        page.tsx                      # Thread list
        [threadId]/
          page.tsx                    # Thread view (realtime)
        _components/                  # ThreadListItem, MessageBubble, ComposeMessage, NewMessageDialog
```

Profile/privacy settings are **not** a new route — they extend the existing shared `app/profile/page.tsx` with a new "SocialLog" section, same pattern as the existing AI/onboarding settings modals there.

### App registry & theming

- `lib/appMode.ts`: add `'sociallog'` to `AppId`, add an `APPS.sociallog` entry (`name: 'SocialLog'`, `home: '/sociallog'`, `themeClass: 'app-sociallog'`), add it to `isAppId`.
- `app/globals.css`: add `.app-sociallog` / `.app-sociallog.dark` blocks, following the existing per-app variable set (background, foreground, card, primary, secondary, muted, accent, destructive, border, input, ring, chart-1..5, sidebar-*). Primary accent derived from `#9e0059` (deep magenta/berry, oklch hue ≈ 350–355°) — exact oklch values computed during implementation to match the precision the other three apps use, keeping the same lightness/chroma conventions so contrast and dark-mode behavior stay consistent.
- New chrome components, siblings of the existing per-app set: `SocialLogMark.tsx` (logo), `SocialLogBottomNav.tsx` (4 tabs: Dashboard, Search, Messages, Profile), `SocialLogProfileMenu.tsx`.

### Data model (Prisma, new models)

All new tables `@@map`'d to `social_*` snake_case names, UUID pks via `dbgenerated("gen_random_uuid()")`, `profileId String @db.Uuid` FKs to the existing shared `Profile`, following existing schema conventions.

```prisma
model SocialPost {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profileId         String    @db.Uuid
  kind              String    // "TEXT" | "MEDIA" | "CROSS_APP_ACTIVITY"
  body              String?
  mediaType         String?   // "image" | "video"
  mediaUrl          String?
  mediaThumbnailUrl String?
  sourceApp         String?   // "burnlog" | "tasklog" | "homelog" | "lifelog", nullable
  sourceRefType     String?   // e.g. "workout_pr", "goal_completed"
  sourceRefId       String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  votes             SocialVote[]
  comments          SocialComment[]
  topics            SocialPostTopic[]

  @@map("social_posts")
}

model SocialComment {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  postId           String    @db.Uuid
  profileId        String    @db.Uuid
  parentCommentId  String?   @db.Uuid   // one level of threading
  body             String
  createdAt        DateTime  @default(now())

  @@map("social_comments")
}

model SocialVote {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  postId     String   @db.Uuid
  profileId  String   @db.Uuid
  value      Int      // +1 or -1
  createdAt  DateTime @default(now())

  @@unique([postId, profileId])
  @@map("social_votes")
}

model SocialFollow {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  followerId   String   @db.Uuid
  followingId  String   @db.Uuid
  createdAt    DateTime @default(now())

  @@unique([followerId, followingId])
  @@map("social_follows")
}

model SocialTopic {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name       String   @unique   // lowercase, no leading #
  createdAt  DateTime @default(now())
  posts      SocialPostTopic[]

  @@map("social_topics")
}

model SocialPostTopic {
  postId    String  @db.Uuid
  topicId   String  @db.Uuid
  post      SocialPost  @relation(fields: [postId], references: [id], onDelete: Cascade)
  topic     SocialTopic @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@id([postId, topicId])
  @@map("social_post_topics")
}

model SocialMessageThread {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  participantAId   String   @db.Uuid  // lower profileId of the pair, normalized
  participantBId   String   @db.Uuid  // higher profileId of the pair, normalized
  lastMessageAt    DateTime @default(now())
  createdAt        DateTime @default(now())
  messages         SocialMessage[]

  @@unique([participantAId, participantBId])
  @@map("social_message_threads")
}

model SocialMessage {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId   String   @db.Uuid
  senderId   String   @db.Uuid
  body       String
  createdAt  DateTime @default(now())
  readAt     DateTime?

  @@map("social_messages")
}

model SocialProfileSettings {
  profileId              String   @id @db.Uuid   // 1:1 with Profile
  bio                    String?
  isPrivate              Boolean  @default(false)
  whoCanMessage           String  @default("everyone") // "everyone" | "followers" | "none"
  showCrossAppActivity   Boolean  @default(true)
  updatedAt              DateTime @updatedAt

  @@map("social_profile_settings")
}
```

`participantAId`/`participantBId` are normalized (lexicographically sorted) at thread-creation time so a 1:1 pair always maps to exactly one thread regardless of who initiates.

### Dashboard (feed)

- Two feed tabs: **Following** (posts/activity from followed users) and **For You** (broader recent/trending). Sort control: **Hot / New / Top**.
  - New: `ORDER BY createdAt DESC`.
  - Top: `ORDER BY (sum of votes) DESC`, optionally scoped to a time window (day/week/all) — window selector is a stretch goal, default "all" for phase 1.
  - Hot: computed at query/render time using a Reddit-style log-scaled score + age decay (no stored/cron-updated score column).
- `ComposeBox` lets a user create a `TEXT` or `MEDIA` post, optionally attaching topics (typed `#tag` parsed client-side, upserted into `SocialTopic`).
- `ActivityCard` renders `CROSS_APP_ACTIVITY` posts distinctly (sourceApp badge + a summary derived from `sourceRefType`).
- A small reusable server-side helper, e.g. `lib/sociallog/createActivityPost.ts`, exposes `createActivityPost({ profileId, sourceApp, sourceRefType, sourceRefId, body })` — checks the actor's `showCrossAppActivity` setting before inserting. Phase 2 wires exactly **one** call site (candidate: tasklog goal completion, or a burnlog workout PR — final pick made at implementation time) as the working example; other sub-apps are not touched.
- Voting: `POST /api/sociallog/posts/[id]/vote` upserts a `SocialVote` (toggling/removing on repeat click of the same value).

### Search

- Segmented control: **Users / Topics / Reels**, debounced query input.
  - Users: search `Profile` by username/name — same query shape as the existing burnlog `FriendSearch` (`app/api/social/search`), but a new endpoint under `app/api/sociallog/search/users` since it needs to also return follow-state against `SocialFollow`, not `Friendship`.
  - Topics: prefix search over `SocialTopic.name`.
  - Reels: `ReelsGrid` — recent/trending `SocialPost` rows where `mediaType = "video"`, rendered as an Instagram-style responsive grid; tapping opens a swipeable reel viewer.

### Messages

- Thread list page: `SocialMessageThread` rows for the current user, ordered by `lastMessageAt`, with the other participant's profile + last message preview.
- Thread view: initial page of messages fetched via SWR + Prisma-backed API route; then subscribes to a Supabase Realtime channel filtered to `threadId` for live inserts, matching Supabase's standard postgres-changes pattern.
- Starting a new thread: `NewMessageDialog` searches users (reusing the Search-tab user-search endpoint), checks the target's `whoCanMessage` setting (`everyone` / `followers` — requires an existing `SocialFollow` from target→me / `none` — blocked) before creating or finding the normalized thread.
- Sending a message: `POST /api/sociallog/messages/threads/[id]/messages` inserts a `SocialMessage` and bumps `lastMessageAt`; Realtime pushes it to the open thread for both participants.

### Media / reels storage

- New public Supabase Storage bucket `sociallog-media`.
- Path convention: `${profileId}/${postId}/${filename}`, direct client-side upload before the `SocialPost` row is created — same flow as `ProfileAvatar.tsx`'s `avatars` bucket usage (list existing → remove stale → upload → `getPublicUrl`).
- Images and short videos are both allowed under `mediaType`; no server-side transcoding in phase 1 (client is expected to upload a reasonably-sized file; a size/duration cap is enforced client-side in the upload component).

### Profile & privacy

- `app/profile/page.tsx` gets a new "SocialLog" settings section (bio, private-account toggle, who-can-message select, show-cross-app-activity toggle), backed by `SocialProfileSettings`, following the existing settings-modal pattern used for AI model settings.
- `SocialLogProfileMenu.tsx` (opened from the SocialLog bottom nav) links into this same shared Profile page, like every other sub-app's profile menu.

### API surface

New routes under `app/api/sociallog/`, one `route.ts` per resource with dynamic segments, mirroring the existing `app/api/social/*` structure:

```
posts/                          GET (feed), POST (create)
posts/[id]/vote/                POST
posts/[id]/comments/            GET, POST
follow/                         POST
follow/[id]/                    DELETE
search/users/                   GET
search/topics/                  GET
search/reels/                   GET
messages/threads/                GET (list), POST (create/find)
messages/threads/[id]/messages/ GET, POST
profile-settings/                GET, PATCH
```

Each route authenticates via the existing Supabase server-side session check (same pattern as `app/api/social/*`), then operates through Prisma.

## Error handling

- Vote/follow/message-send endpoints are idempotent-safe (upsert on unique constraints) so double-taps/network retries don't create duplicate rows or errors.
- Blocked-messaging (`whoCanMessage`) violations return a 403 with a clear reason the client surfaces as a toast ("This user only accepts messages from followers").
- Realtime subscription failures fall back to the existing SWR polling fetch (refetch on focus/interval) so the thread view still works, just without live push.

## Testing

- Prisma schema changes verified via `prisma migrate dev` locally + `prisma validate`.
- API routes covered by manual verification against the running dev server (project has no existing automated test suite for API routes — matches current convention).
- Feed sort correctness (Hot/New/Top) spot-checked with seeded posts of varying age/score.
- Realtime message delivery verified manually across two browser sessions.

## Phased Build Order

1. **Foundation** — route scaffold, `.app-sociallog` theme, nav/menu/mark components, all Prisma models + migration, Profile privacy settings section.
2. **Dashboard** — posts, comments, voting, follow, Following/For You feed, Hot/New/Top sort, one cross-app activity integration.
3. **Search** — users, topics, reels grid.
4. **Messages** — 1:1 threads + Supabase Realtime.

Each phase is independently shippable and gets its own implementation plan via `writing-plans`.
