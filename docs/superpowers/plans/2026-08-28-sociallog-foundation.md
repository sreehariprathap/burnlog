# SocialLog Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SocialLog sub-app shell — route scaffold, `#9e0059`-derived theme, navigation, the full SocialLog Prisma data model + RLS, and the SocialLog privacy settings section on the shared Profile page — so Phases 2–4 (Dashboard, Search, Messages) have a working app to build features into.

**Architecture:** Follows the existing multi-app-in-one-Next.js-app pattern used by `(tasklog)`/`(lifelog)`/`(homelog)`: a URL-transparent route group `(sociallog)` wrapping a real `sociallog/` segment, a `themeClass` entry in the shared `lib/appMode.ts` registry, CSS-variable theme overrides scoped by class in `app/globals.css`, and sibling nav-chrome components (`SocialLogMark`, `SocialLogBottomNav`, `SocialLogProfileMenu`). All new DB tables are defined in `prisma/schema.prisma` (schema/migration only — Prisma is not used at runtime in this codebase) and pushed with `prisma db push`; runtime reads/writes go through the Supabase JS client, matching every existing API route under `app/api/social/*` and `app/api/*`. Row Level Security policies are hand-written SQL appended to `supabase/rls.sql`, run manually in the Supabase SQL editor after `db push` (this is the project's established RLS workflow — see the file's own header comment).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma 6 (schema/migration only), `@supabase/supabase-js` + `@supabase/auth-helpers-nextjs` (runtime data access + auth), Tailwind CSS v4 (CSS custom properties per theme class), shadcn/ui (`components/ui/*`), lucide-react icons, `motion` for the active-tab indicator.

## Global Constraints

- No automated test suite exists in this project (no Jest/Vitest/Playwright). Verification is `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, and manual checks against `npm run dev` — this matches the project's current convention (see spec's Testing section).
- New Prisma models use `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`, `profileId String @db.Uuid` FKs to `Profile`, `@@map("social_*")` snake_case table names, and a `///` doc comment above each model — copy the exact style already used for `Friendship` and `GroceryList` in `prisma/schema.prisma`.
- Every new table gets RLS enabled with an explicit policy in `supabase/rls.sql` before it's queried from any client-side Supabase call — this project has no default-deny fallback, an un-policied table with RLS off is world-readable/writable.
- Runtime DB access in new API routes uses `createServiceRoleClient()` from `lib/supabase/serviceRole.ts` (service-role Supabase JS client, bypasses RLS), authenticated first via `createRouteHandlerClient({ cookies }).auth.getUser()` — copy the exact shape of `app/api/social/search/route.ts` and `app/api/social/requests/route.ts`.
- Do not touch `(burnlog)`, `(tasklog)`, `(lifelog)`, `(homelog)`, or `app/api/social/*` (the existing friends/leaderboard feature) — this plan only adds new files plus small additive edits to `lib/appMode.ts`, `app/globals.css`, `components/TopBar.tsx`, `components/AppSwitcher.tsx`, `app/profile/page.tsx`, and `supabase/rls.sql`.

---

### Task 1: Prisma schema — SocialLog data model

**Files:**
- Modify: `prisma/schema.prisma` (append new models after the existing `Friendship` model at line 382; add relation fields to `Profile` model, e.g. near `friendshipsReceived Friendship[] @relation("FriendshipAddressee")` at line 75)

**Interfaces:**
- Produces: Prisma models `SocialPost`, `SocialComment`, `SocialVote`, `SocialFollow`, `SocialTopic`, `SocialPostTopic`, `SocialMessageThread`, `SocialMessage`, `SocialProfileSettings` — table names `social_posts`, `social_comments`, `social_votes`, `social_follows`, `social_topics`, `social_post_topics`, `social_message_threads`, `social_messages`, `social_profile_settings`. Later tasks query these tables by these exact snake_case names via the Supabase JS client (Supabase/PostgREST exposes tables by their DB name, not the Prisma model name).

- [ ] **Step 1: Add the relation fields to `Profile`**

In `prisma/schema.prisma`, in the `Profile` model, immediately after the existing line:

```prisma
  friendshipsSent     Friendship[] @relation("FriendshipRequester")
  friendshipsReceived Friendship[] @relation("FriendshipAddressee")
```

add:

```prisma
  socialPosts             SocialPost[]
  socialComments          SocialComment[]
  socialVotes             SocialVote[]
  socialFollowersOf       SocialFollow[] @relation("SocialFollowFollowing")
  socialFollowing         SocialFollow[] @relation("SocialFollowFollower")
  socialMessageThreadsA   SocialMessageThread[] @relation("SocialMessageThreadParticipantA")
  socialMessageThreadsB   SocialMessageThread[] @relation("SocialMessageThreadParticipantB")
  socialMessagesSent      SocialMessage[]
  socialProfileSettings   SocialProfileSettings?
```

- [ ] **Step 2: Append the new models**

After the closing `}` of the `Friendship` model (line 382 in the current file), insert:

```prisma
/// sociallog: a post — original text/media, or an auto-generated cross-app activity card
model SocialPost {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile           Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId         String    @db.Uuid
  kind              String    // "TEXT" | "MEDIA" | "CROSS_APP_ACTIVITY"
  body              String?
  mediaType         String?   // "image" | "video"
  mediaUrl          String?
  mediaThumbnailUrl String?
  sourceApp         String?   // "burnlog" | "tasklog" | "homelog" | "lifelog"
  sourceRefType     String?
  sourceRefId       String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  comments SocialComment[]
  votes    SocialVote[]
  topics   SocialPostTopic[]

  @@map("social_posts")
}

/// sociallog: a comment on a post, with one level of threading via parentCommentId
model SocialComment {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  post            SocialPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  postId          String   @db.Uuid
  profile         Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId       String   @db.Uuid
  parentCommentId String?  @db.Uuid
  body            String
  createdAt       DateTime @default(now())

  @@map("social_comments")
}

/// sociallog: one profile's upvote (+1) or downvote (-1) on a post
model SocialVote {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  post      SocialPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  postId    String   @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @db.Uuid
  value     Int
  createdAt DateTime @default(now())

  @@unique([postId, profileId])
  @@map("social_votes")
}

/// sociallog: one-directional follow, independent of the burnlog Friendship graph
model SocialFollow {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  follower    Profile  @relation("SocialFollowFollower", fields: [followerId], references: [id], onDelete: Cascade)
  followerId  String   @db.Uuid
  following   Profile  @relation("SocialFollowFollowing", fields: [followingId], references: [id], onDelete: Cascade)
  followingId String   @db.Uuid
  createdAt   DateTime @default(now())

  @@unique([followerId, followingId])
  @@map("social_follows")
}

/// sociallog: a lightweight hashtag/topic, lowercase and unique
model SocialTopic {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String   @unique
  createdAt DateTime @default(now())

  posts SocialPostTopic[]

  @@map("social_topics")
}

/// sociallog: join table linking posts to the topics they mention
model SocialPostTopic {
  post    SocialPost  @relation(fields: [postId], references: [id], onDelete: Cascade)
  postId  String      @db.Uuid
  topic   SocialTopic @relation(fields: [topicId], references: [id], onDelete: Cascade)
  topicId String      @db.Uuid

  @@id([postId, topicId])
  @@map("social_post_topics")
}

/// sociallog: a 1:1 DM thread; participantAId/participantBId are always stored with the lexicographically smaller id first
model SocialMessageThread {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  participantA   Profile  @relation("SocialMessageThreadParticipantA", fields: [participantAId], references: [id], onDelete: Cascade)
  participantAId String   @db.Uuid
  participantB   Profile  @relation("SocialMessageThreadParticipantB", fields: [participantBId], references: [id], onDelete: Cascade)
  participantBId String   @db.Uuid
  lastMessageAt  DateTime @default(now())
  createdAt      DateTime @default(now())

  messages SocialMessage[]

  @@unique([participantAId, participantBId])
  @@map("social_message_threads")
}

/// sociallog: a single DM within a thread
model SocialMessage {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  thread    SocialMessageThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  threadId  String   @db.Uuid
  sender    Profile  @relation(fields: [senderId], references: [id], onDelete: Cascade)
  senderId  String   @db.Uuid
  body      String
  createdAt DateTime @default(now())
  readAt    DateTime?

  @@map("social_messages")
}

/// sociallog: 1:1 privacy/bio settings for a profile, created lazily on first visit to SocialLog profile settings
model SocialProfileSettings {
  profile                Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId              String   @id @db.Uuid
  bio                    String?
  isPrivate              Boolean  @default(false)
  whoCanMessage          String   @default("everyone") // "everyone" | "followers" | "none"
  showCrossAppActivity   Boolean  @default(true)
  updatedAt              DateTime @updatedAt

  @@map("social_profile_settings")
}
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Push the schema and regenerate the client**

Run: `npx prisma db push`
Expected: output ending in `Your database is now in sync with your Prisma schema.` followed by `✔ Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(sociallog): add SocialLog Prisma data model"
```

---

### Task 2: Row Level Security + storage bucket

**Files:**
- Modify: `supabase/rls.sql` (append a new section at the end of the file)

**Interfaces:**
- Consumes: table names from Task 1 (`social_posts`, `social_comments`, `social_votes`, `social_follows`, `social_topics`, `social_post_topics`, `social_message_threads`, `social_messages`, `social_profile_settings`).
- Produces: RLS policies gating any future direct Supabase client access to these tables, and a public `sociallog-media` storage bucket for Phase 2's post media uploads.

- [ ] **Step 1: Append RLS policies and the storage bucket to `supabase/rls.sql`**

At the end of `supabase/rls.sql`, add:

```sql
-- sociallog ---------------------------------------------------------------
-- social_posts / social_comments / social_votes: publicly readable (it's a
-- feed), writable only by the row's own profile.
do $$
declare
  t text;
begin
  foreach t in array array['social_posts', 'social_comments', 'social_votes']
  loop
    execute format('alter table %I enable row level security', t);

    execute format($f$
      create policy %I on %I
        for select using (true)
    $f$, t || '_public_read', t);

    execute format($f$
      create policy %I on %I
        for all
        using (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from profiles
            where profiles.id = %I."profileId"
              and profiles."userId" = auth.uid()
          )
        )
    $f$, t || '_owner_write', t, t, t);
  end loop;
end $$;

-- social_follows: publicly readable (follower/following counts), but a
-- profile may only create/remove follow rows where it is the follower.
alter table social_follows enable row level security;

create policy "social_follows_public_read" on social_follows
  for select using (true);

create policy "social_follows_follower_write" on social_follows
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = social_follows."followerId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = social_follows."followerId"
        and profiles."userId" = auth.uid()
    )
  );

-- social_topics / social_post_topics: publicly readable; no client-side
-- write policy (only the service-role API routes create/link topics).
alter table social_topics enable row level security;
create policy "social_topics_public_read" on social_topics
  for select using (true);

alter table social_post_topics enable row level security;
create policy "social_post_topics_public_read" on social_post_topics
  for select using (true);

-- social_message_threads / social_messages: visible only to participants.
alter table social_message_threads enable row level security;

create policy "social_message_threads_participant_read" on social_message_threads
  for select using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and (profiles.id = social_message_threads."participantAId" or profiles.id = social_message_threads."participantBId")
    )
  );

alter table social_messages enable row level security;

create policy "social_messages_participant_read" on social_messages
  for select using (
    exists (
      select 1 from social_message_threads t
      join profiles on profiles."userId" = auth.uid()
      where t.id = social_messages."threadId"
        and (profiles.id = t."participantAId" or profiles.id = t."participantBId")
    )
  );

create policy "social_messages_sender_insert" on social_messages
  for insert with check (
    exists (
      select 1 from social_message_threads t
      join profiles on profiles."userId" = auth.uid()
      where t.id = social_messages."threadId"
        and profiles.id = social_messages."senderId"
        and (profiles.id = t."participantAId" or profiles.id = t."participantBId")
    )
  );

-- social_profile_settings: bio/privacy flags are publicly readable (needed
-- to render other users' profile cards), writable only by the owner.
alter table social_profile_settings enable row level security;

create policy "social_profile_settings_public_read" on social_profile_settings
  for select using (true);

create policy "social_profile_settings_owner_write" on social_profile_settings
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = social_profile_settings."profileId"
        and profiles."userId" = auth.uid()
    )
  );

create policy "social_profile_settings_owner_update" on social_profile_settings
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = social_profile_settings."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = social_profile_settings."profileId"
        and profiles."userId" = auth.uid()
    )
  );

-- sociallog-media storage bucket --------------------------------------------
insert into storage.buckets (id, name, public)
values ('sociallog-media', 'sociallog-media', true)
on conflict (id) do nothing;

create policy "sociallog_media_public_read" on storage.objects
  for select
  using (bucket_id = 'sociallog-media');

create policy "sociallog_media_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sociallog_media_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sociallog_media_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'sociallog-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Run the appended SQL against the Supabase project**

Open the Supabase project's SQL Editor and run the full contents of `supabase/rls.sql` (or, if it was already run previously, just the newly-appended section from `-- sociallog ---` to the end).
Expected: all statements succeed with no errors; `select * from storage.buckets where id = 'sociallog-media'` returns one row with `public = true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/rls.sql
git commit -m "feat(sociallog): add RLS policies and media storage bucket"
```

---

### Task 3: Register SocialLog in the app registry

**Files:**
- Modify: `lib/appMode.ts:2` (add to `AppId`), `lib/appMode.ts:12-40` (add `APPS.sociallog`), `lib/appMode.ts:51` (add to `isAppId`)

**Interfaces:**
- Produces: `AppId` includes `'sociallog'`; `APPS.sociallog = { id: 'sociallog', name: 'SocialLog', tagline: ..., home: '/sociallog', themeClass: 'app-sociallog' }`. Task 5 (nav components), Task 6 (layout), and Task 7 (profile settings) all read this entry.

- [ ] **Step 1: Update `AppId` and `isAppId`**

In `lib/appMode.ts`, change line 2:

```ts
export type AppId = 'burnlog' | 'lifelog' | 'tasklog' | 'homelog' | 'sociallog';
```

and change the `isAppId` function (line 50-52):

```ts
function isAppId(val: string | null): val is AppId {
  return val === 'burnlog' || val === 'lifelog' || val === 'tasklog' || val === 'homelog' || val === 'sociallog';
}
```

- [ ] **Step 2: Add the `sociallog` entry to `APPS`**

In `lib/appMode.ts`, inside the `APPS` object, after the `homelog` entry (before the closing `};` at line 40), add:

```ts
  sociallog: {
    id: 'sociallog',
    name: 'SocialLog',
    tagline: 'Share, follow, and connect',
    home: '/sociallog',
    themeClass: 'app-sociallog',
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (existing baseline errors, if any, are unaffected — compare against a run before this change if unsure).

- [ ] **Step 4: Commit**

```bash
git add lib/appMode.ts
git commit -m "feat(sociallog): register sociallog in the app registry"
```

---

### Task 4: SocialLog theme

**Files:**
- Modify: `app/globals.css` (add two new blocks after the `.app-homelog.dark` block, i.e. after line 341)

**Interfaces:**
- Produces: CSS classes `.app-sociallog` and `.app-sociallog.dark`, applied to `document.documentElement` by Task 6's layout — same variable set as `.app-tasklog`/`.app-lifelog`/`.app-homelog` (background, foreground, card, primary, secondary, muted, accent, destructive, border, input, ring, chart-1..5, sidebar-*).

- [ ] **Step 1: Add the theme blocks**

In `app/globals.css`, immediately after the closing `}` of `.app-homelog.dark` (line 341), add:

```css
.app-sociallog {
  --background: #fdf5f8;
  --foreground: oklch(0.3 0.05 357);
  --card: #fdf5f8;
  --card-foreground: oklch(0.3 0.05 357);
  --popover: #fdf5f8;
  --popover-foreground: oklch(0.3 0.05 357);
  --primary: oklch(0.46 0.19 357);
  --primary-foreground: #fdf5f8;
  --secondary: oklch(0.4 0.14 357);
  --secondary-foreground: #fdf5f8;
  --muted: oklch(0.91 0.03 357);
  --muted-foreground: oklch(0.42 0.07 357);
  --accent: oklch(0.8 0.09 357);
  --accent-foreground: oklch(0.3 0.05 357);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.86 0.05 357);
  --input: oklch(0.86 0.05 357);
  --ring: oklch(0.46 0.19 357);
  --chart-1: oklch(0.46 0.19 357);
  --chart-2: oklch(0.5 0.17 340);
  --chart-3: oklch(0.4 0.14 357);
  --chart-4: oklch(0.8 0.09 357);
  --chart-5: oklch(0.42 0.07 357);
  --sidebar: #fdf5f8;
  --sidebar-foreground: oklch(0.3 0.05 357);
  --sidebar-primary: oklch(0.46 0.19 357);
  --sidebar-primary-foreground: #fdf5f8;
  --sidebar-accent: oklch(0.8 0.09 357);
  --sidebar-accent-foreground: oklch(0.3 0.05 357);
  --sidebar-border: oklch(0.86 0.05 357);
  --sidebar-ring: oklch(0.46 0.19 357);
}

.app-sociallog.dark {
  --background: oklch(0.22 0.03 357);
  --foreground: #fbeef3;
  --card: oklch(0.28 0.04 357);
  --card-foreground: #fbeef3;
  --popover: oklch(0.28 0.04 357);
  --popover-foreground: #fbeef3;
  --primary: oklch(0.62 0.19 357);
  --primary-foreground: oklch(0.2 0.03 357);
  --secondary: oklch(0.48 0.15 357);
  --secondary-foreground: #fbeef3;
  --muted: oklch(0.3 0.04 357);
  --muted-foreground: oklch(0.75 0.05 357);
  --accent: oklch(0.4 0.1 357);
  --accent-foreground: #fbeef3;
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 18%);
  --ring: oklch(0.58 0.15 357);
  --chart-1: oklch(0.62 0.19 357);
  --chart-2: oklch(0.55 0.16 340);
  --chart-3: oklch(0.48 0.15 357);
  --chart-4: oklch(0.4 0.1 357);
  --chart-5: oklch(0.75 0.05 357);
  --sidebar: oklch(0.28 0.04 357);
  --sidebar-foreground: #fbeef3;
  --sidebar-primary: oklch(0.62 0.19 357);
  --sidebar-primary-foreground: oklch(0.2 0.03 357);
  --sidebar-accent: oklch(0.4 0.1 357);
  --sidebar-accent-foreground: #fbeef3;
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.58 0.15 357);
}
```

(`oklch(0.46 0.19 357)` is `#9e0059` converted to OKLCH — the hue 357 and the lightness/chroma progression above follow the same formula used for the other three apps' `--primary`/`--chart-*`/`--sidebar-*` ramps.)

- [ ] **Step 2: Verify no syntax errors**

Run: `npm run lint`
Expected: no new errors from `app/globals.css` (CSS isn't linted by ESLint, but this also catches any accidental JS/TS breakage — expect the same output as before this change).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(sociallog): add sociallog theme (#9e0059-derived)"
```

---

### Task 5: Nav chrome components

**Files:**
- Create: `components/SocialLogMark.tsx`
- Create: `components/SocialLogProfileMenu.tsx`
- Create: `components/SocialLogBottomNav.tsx`
- Modify: `components/TopBar.tsx` (add a `sociallog` branch to the mark switch)
- Modify: `components/AppSwitcher.tsx` (add a `sociallog` branch to the mark switch)

**Interfaces:**
- Consumes: `APPS.sociallog` from Task 3.
- Produces: `<SocialLogMark size={number} className?} />`, `<SocialLogProfileMenu isActive={boolean} />`, `<SocialLogBottomNav />` — Task 6's layout and Task 7's profile page render `<SocialLogBottomNav />`; `TopBar`/`AppSwitcher` render `<SocialLogMark />` when `activeApp === 'sociallog'` / `app.id === 'sociallog'`.

- [ ] **Step 1: Create `SocialLogMark.tsx`**

```tsx
// components/SocialLogMark.tsx
import { cn } from '@/lib/utils';

interface SocialLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed magenta, independent of the ambient theme — see TaskLogMark for why
// (this can render before .app-sociallog is applied, so `text-primary`
// would briefly show the wrong app's color).
export function SocialLogMark({ size = 20, className }: SocialLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * 1.6, color: '#9e0059' }}
      aria-hidden="true"
    >
      S
    </span>
  );
}
```

- [ ] **Step 2: Create `SocialLogProfileMenu.tsx`**

```tsx
// components/SocialLogProfileMenu.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { motion } from 'motion/react';
import { UserIcon, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type SocialLogProfileMenuProps = {
  isActive: boolean;
};

export function SocialLogProfileMenu({ isActive }: SocialLogProfileMenuProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {isActive && (
            <motion.span
              layoutId="sociallog-bottom-nav-active"
              className="absolute inset-0 rounded-full bg-primary/10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <UserIcon className="relative z-10 mb-0.5 h-5 w-5" />
          <span className="relative z-10">Profile</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center">
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <UserIcon className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Create `SocialLogBottomNav.tsx`**

```tsx
// components/SocialLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SocialLogMark } from '@/components/SocialLogMark';
import { SocialLogProfileMenu } from '@/components/SocialLogProfileMenu';

const tabs = [
  { href: '/sociallog', label: 'Home', Icon: null },
  { href: '/sociallog/search', label: 'Search', Icon: SearchIcon },
  { href: '/sociallog/messages', label: 'Messages', Icon: MessageCircleIcon },
];

export function SocialLogBottomNav() {
  const pathname = usePathname();
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/sociallog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <SocialLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <SocialLogProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
```

- [ ] **Step 4: Wire the mark into `TopBar.tsx`**

In `components/TopBar.tsx`, add the import:

```ts
import { SocialLogMark } from './SocialLogMark';
```

and change the mark switch (originally):

```tsx
{activeApp === 'lifelog' ? (
  <LifeLogMark size={20} />
) : activeApp === 'tasklog' ? (
  <TaskLogMark size={20} />
) : activeApp === 'homelog' ? (
  <HomeLogMark size={20} />
) : (
  <Image src="/B.png" alt="Logo" width={20} height={20} />
)}
```

to:

```tsx
{activeApp === 'lifelog' ? (
  <LifeLogMark size={20} />
) : activeApp === 'tasklog' ? (
  <TaskLogMark size={20} />
) : activeApp === 'homelog' ? (
  <HomeLogMark size={20} />
) : activeApp === 'sociallog' ? (
  <SocialLogMark size={20} />
) : (
  <Image src="/B.png" alt="Logo" width={20} height={20} />
)}
```

- [ ] **Step 5: Wire the mark into `AppSwitcher.tsx`**

In `components/AppSwitcher.tsx`, add the import:

```ts
import { SocialLogMark } from '@/components/SocialLogMark';
```

and change the mark switch (originally):

```tsx
{app.id === 'lifelog' ? (
  <LifeLogMark size={24} />
) : app.id === 'tasklog' ? (
  <TaskLogMark size={24} />
) : app.id === 'homelog' ? (
  <HomeLogMark size={24} />
) : (
  <Image src="/B.png" alt={app.name} width={24} height={24} />
)}
```

to:

```tsx
{app.id === 'lifelog' ? (
  <LifeLogMark size={24} />
) : app.id === 'tasklog' ? (
  <TaskLogMark size={24} />
) : app.id === 'homelog' ? (
  <HomeLogMark size={24} />
) : app.id === 'sociallog' ? (
  <SocialLogMark size={24} />
) : (
  <Image src="/B.png" alt={app.name} width={24} height={24} />
)}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add components/SocialLogMark.tsx components/SocialLogProfileMenu.tsx components/SocialLogBottomNav.tsx components/TopBar.tsx components/AppSwitcher.tsx
git commit -m "feat(sociallog): add sociallog nav chrome components"
```

---

### Task 6: Route scaffold — layout + placeholder pages

**Files:**
- Create: `app/(sociallog)/layout.tsx`
- Create: `app/(sociallog)/sociallog/page.tsx`
- Create: `app/(sociallog)/sociallog/search/page.tsx`
- Create: `app/(sociallog)/sociallog/messages/page.tsx`

**Interfaces:**
- Consumes: `setActiveApp` from `lib/appMode.ts` (Task 3), `SocialLogBottomNav` from Task 5, `TopBar` from `components/TopBar.tsx`.
- Produces: working routes `/sociallog`, `/sociallog/search`, `/sociallog/messages` reachable from the bottom nav and the `AppSwitcher`. These are placeholder ("coming soon") screens — Phases 2–4 replace their bodies with real features; the route files, layout, and nav wiring built here stay.

- [ ] **Step 1: Create the layout**

```tsx
// app/(sociallog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function SocialLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-lifelog');
    document.documentElement.classList.remove('app-tasklog');
    document.documentElement.classList.remove('app-homelog');
    document.documentElement.classList.add('app-sociallog');
    setActiveApp('sociallog');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 2: Create the Dashboard placeholder page**

```tsx
// app/(sociallog)/sociallog/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SocialLogDashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="SocialLog" />
      <main className="flex-1 container mx-auto p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Your feed is coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Posts, follows, and cross-app activity will show up here.
            </p>
          </CardContent>
        </Card>
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Create the Search placeholder page**

```tsx
// app/(sociallog)/sociallog/search/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SocialLogSearchPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Search" />
      <main className="flex-1 container mx-auto p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Search is coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Find users, topics, and reels here.
            </p>
          </CardContent>
        </Card>
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Create the Messages placeholder page**

```tsx
// app/(sociallog)/sociallog/messages/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SocialLogMessagesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Messages" />
      <main className="flex-1 container mx-auto p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Messages are coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your direct message threads will show up here.
            </p>
          </CardContent>
        </Card>
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, log in, open the `AppSwitcher` (tap the mark in `TopBar`), select "SocialLog".
Expected: URL becomes `/sociallog`; background/accent colors switch to the magenta `#9e0059`-derived theme; bottom nav shows Home/Search/Messages/Profile; tapping Search/Messages navigates to their placeholder cards; tapping Profile opens the dropdown with a working "Profile" link and "Log Out".

- [ ] **Step 7: Commit**

```bash
git add "app/(sociallog)"
git commit -m "feat(sociallog): add route scaffold and placeholder pages"
```

---

### Task 7: SocialLog privacy settings on the Profile page

**Files:**
- Create: `app/api/sociallog/profile-settings/route.ts`
- Create: `app/profile/_components/SocialLogSettingsCard.tsx`
- Modify: `app/profile/page.tsx` (import + render the new card when `activeApp === 'sociallog'`)

**Interfaces:**
- Consumes: `createServiceRoleClient` from `lib/supabase/serviceRole.ts`, `createRouteHandlerClient` from `@supabase/auth-helpers-nextjs`, `activeApp` state already present in `app/profile/page.tsx`.
- Produces: `GET /api/sociallog/profile-settings` → `{ bio: string | null, isPrivate: boolean, whoCanMessage: 'everyone' | 'followers' | 'none', showCrossAppActivity: boolean }` (creates a default row on first call if none exists). `PATCH /api/sociallog/profile-settings` with a partial body of the same shape → updates and returns the full updated object. `<SocialLogSettingsCard />` (no props) — self-contained, fetches/saves via these two endpoints.

- [ ] **Step 1: Create the API route**

```ts
// app/api/sociallog/profile-settings/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

const WHO_CAN_MESSAGE_VALUES = ['everyone', 'followers', 'none'] as const;
type WhoCanMessage = (typeof WHO_CAN_MESSAGE_VALUES)[number];

async function getMyProfileId(admin: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function getOrCreateSettings(admin: ReturnType<typeof createServiceRoleClient>, profileId: string) {
  const { data: existing } = await admin
    .from('social_profile_settings')
    .select('profileId, bio, isPrivate, whoCanMessage, showCrossAppActivity')
    .eq('profileId', profileId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await admin
    .from('social_profile_settings')
    .insert({ profileId })
    .select('profileId, bio, isPrivate, whoCanMessage, showCrossAppActivity')
    .single();

  if (error) throw error;
  return created;
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const settings = await getOrCreateSettings(admin, profileId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('sociallog profile-settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { bio, isPrivate, whoCanMessage, showCrossAppActivity } = body as {
      bio?: string | null;
      isPrivate?: boolean;
      whoCanMessage?: WhoCanMessage;
      showCrossAppActivity?: boolean;
    };

    if (whoCanMessage !== undefined && !WHO_CAN_MESSAGE_VALUES.includes(whoCanMessage)) {
      return NextResponse.json({ error: 'Invalid whoCanMessage value' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await getOrCreateSettings(admin, profileId);

    const update: Record<string, unknown> = {};
    if (bio !== undefined) update.bio = bio;
    if (isPrivate !== undefined) update.isPrivate = isPrivate;
    if (whoCanMessage !== undefined) update.whoCanMessage = whoCanMessage;
    if (showCrossAppActivity !== undefined) update.showCrossAppActivity = showCrossAppActivity;

    const { data: updated, error } = await admin
      .from('social_profile_settings')
      .update(update)
      .eq('profileId', profileId)
      .select('profileId, bio, isPrivate, whoCanMessage, showCrossAppActivity')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('sociallog profile-settings PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the settings card component**

```tsx
// app/profile/_components/SocialLogSettingsCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

type WhoCanMessage = 'everyone' | 'followers' | 'none';

type Settings = {
  bio: string | null;
  isPrivate: boolean;
  whoCanMessage: WhoCanMessage;
  showCrossAppActivity: boolean;
};

export function SocialLogSettingsCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [bioInput, setBioInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/sociallog/profile-settings');
      if (res.ok) {
        const data: Settings = await res.json();
        setSettings(data);
        setBioInput(data.bio ?? '');
      }
      setLoading(false);
    })();
  }, []);

  const patch = async (update: Partial<Settings>) => {
    setSaving(true);
    const res = await fetch('/api/sociallog/profile-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (res.ok) {
      const data: Settings = await res.json();
      setSettings(data);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SocialLog</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SocialLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Bio</p>
          <Textarea
            value={bioInput}
            onChange={(e) => setBioInput(e.target.value)}
            onBlur={() => {
              if (bioInput !== (settings.bio ?? '')) patch({ bio: bioInput });
            }}
            placeholder="Tell people about yourself"
            maxLength={280}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Private account</p>
            <p className="text-xs text-muted-foreground">Only approved followers see your posts</p>
          </div>
          <Switch
            checked={settings.isPrivate}
            onCheckedChange={(checked) => patch({ isPrivate: checked })}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Who can message me</p>
          </div>
          <Select
            value={settings.whoCanMessage}
            onValueChange={(value) => patch({ whoCanMessage: value as WhoCanMessage })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="followers">Followers</SelectItem>
              <SelectItem value="none">No one</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Show cross-app activity</p>
            <p className="text-xs text-muted-foreground">Let your BurnLog/TaskLog/HomeLog/LifeLog milestones post here</p>
          </div>
          <Switch
            checked={settings.showCrossAppActivity}
            onCheckedChange={(checked) => patch({ showCrossAppActivity: checked })}
            disabled={saving}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire the card into the Profile page**

In `app/profile/page.tsx`, add the import near the other `_components` imports:

```ts
import { SocialLogSettingsCard } from './_components/SocialLogSettingsCard';
```

Then, after the closing `)}` of the "AI Model Settings" admin card block (the block ending right before the final `<div className="mt-6 text-center">` logout button, i.e. after line 642 in the current file), add:

```tsx
{activeApp === 'sociallog' && (
  <div className="mt-6">
    <SocialLogSettingsCard />
  </div>
)}
```

Finally, change the bottom-nav render at the end of the component (currently):

```tsx
{activeApp === 'lifelog' ? <LifeLogBottomNav /> : <BottomNav />}
```

to:

```tsx
{activeApp === 'lifelog' ? (
  <LifeLogBottomNav />
) : activeApp === 'sociallog' ? (
  <SocialLogBottomNav />
) : (
  <BottomNav />
)}
```

and add the import:

```ts
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, navigate to `/sociallog`, open Profile from the bottom nav.
Expected: a "SocialLog" card appears with Bio/Private account/Who can message me/Show cross-app activity controls; editing the bio and blurring the field persists it (reload the page and confirm it's still there); toggling "Private account" and refreshing shows the toggle stayed on; switching "Who can message me" to "Followers" and refreshing shows it stayed on "Followers". Also confirm navigating to `/profile` while `burnlog` is the active app does **not** show the SocialLog card (it's conditioned on `activeApp === 'sociallog'`).

- [ ] **Step 6: Commit**

```bash
git add app/api/sociallog/profile-settings/route.ts app/profile/_components/SocialLogSettingsCard.tsx app/profile/page.tsx
git commit -m "feat(sociallog): add SocialLog privacy settings to Profile page"
```

---

### Task 8: End-to-end foundation verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full typecheck, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three succeed with no new errors (the `build` step also catches any Server/Client component boundary mistakes that `tsc`/`lint` miss).

- [ ] **Step 2: Manual smoke test of the whole foundation**

Run: `npm run dev`, then walk through:
1. Log in, open the `AppSwitcher`, switch to SocialLog — confirm the `#9e0059`-derived theme applies (check both light and dark mode via the theme toggle in `TopBar`).
2. Set SocialLog as the default app from `/profile` → "App" card, reload the root URL (`/`), confirm it boots into `/sociallog`.
3. Navigate all three tabs (Home, Search, Messages) plus Profile — confirm each loads without console errors.
4. In Supabase Studio, confirm the 9 new tables exist under the `public` schema with RLS enabled (padlock icon), and that `storage.buckets` contains `sociallog-media` with `public = true`.
5. Switch back to another app (e.g. BurnLog) and confirm its theme/nav are unaffected — this catches any leaked `.app-sociallog` class or shared-state regression.

- [ ] **Step 3: Set default app back**

If step 2.2 changed your local default app to `sociallog`, switch it back to whatever it was before testing (via `/profile` → "App" card), so you don't carry a test artifact into normal use.
