# In-App Notification Inbox — Design Spec

## Goal

Persist every notification this app sends (currently OS push only, via
`sendPushToUser`) as an in-app record, so a user can see what they missed
if push was never granted, dismissed, or the device wasn't reachable.
Surface it as a bell icon with an unread badge in `TopBar.tsx` (shared
across every app), opening a `Drawer` list.

## Non-goals

- Read-per-item tracking / individual mark-as-read. Opening the drawer
  marks everything read — matches the simplest common bell-icon UX and
  avoids per-row API calls.
- Notification preferences/muting per type. Every push this app already
  sends becomes a notification; no opt-out granularity in this pass.
- Retention/cleanup jobs. No other model in this schema prunes old rows
  (invites, reminders, etc. all persist indefinitely) — consistent to
  leave this the same.
- Editing the 18 existing call sites. The whole point of this design is
  that none of them change — see below.

## Fan-out design

18 call sites currently call `sendPushToUser(admin, userId, payload)`
across HomeLog invites/chores, SocialLog follows/messages, TravelLog
invites, LearnLog group invites, the two cron jobs, and the admin test
tool (`/api/notifications/send`). All 18 use the identical signature
with a service-role (`admin`) Supabase client.

Rather than editing 18 files, `sendPushToUser` itself
(`lib/pushNotification/server.ts`) gains one step: resolve `profiles.id`
from the `userId` it already receives, then insert a `Notification` row
with the same `title`/`message`/`url` — **before** attempting delivery,
so a notification is recorded even if the user has zero push
subscriptions (the exact case this feature exists to cover) or delivery
throws. Every existing and future caller gets history for free.

## Data model

```prisma
model Notification {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @db.Uuid
  title     String
  message   String
  url       String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@map("notifications")
}
```

Add `Notification[]` to `Profile`.

## API

- `GET /api/notifications` — caller's most recent 30 notifications
  (newest first) + `unreadCount`.
- `POST /api/notifications/read-all` — sets `read = true` on every
  unread row for the caller.

## UI

`components/NotificationBell.tsx`, mounted in `TopBar.tsx` next to
`ThemeToggle`:
- SWR-fetches `/api/notifications` for the initial list + unread count.
- Subscribes to a Supabase Realtime channel on `postgres_changes` INSERT
  for `notifications` filtered by the caller's `profileId` (same pattern
  already proven in SocialLog's chat thread page), incrementing the
  badge and prepending new rows live without a refresh.
- Bell + numeric badge (hidden at 0). Click opens a `Drawer` (matching
  the app's existing mobile-first drawer pattern — `AppSwitcher`, every
  invite form) listing notifications (title, message, relative time via
  the existing `formatRelative` from `lib/format.ts`), each row
  navigating to its `url` on click. Opening the drawer fires
  `POST /api/notifications/read-all`.

## Fixed along the way

`TopBar.tsx`'s own app-icon switch statement (the top-left button that
opens `AppSwitcher`) is missing a `'learnlog'` case and falls through to
`BurnLogMark` — the same bug class reported earlier and already fixed in
`AppSwitcher.tsx`, just a different file. Since this plan touches
`TopBar.tsx` anyway, fix it in the same task.

## Error handling & testing

The `Notification` insert inside `sendPushToUser` must not throw and
abort delivery if it fails — wrap it, log, continue to the push-send
step regardless (delivery already has its own per-subscription
try/catch). No automated tests, consistent with this repo. Verified
manually via the admin "Test Push Notifications" tool (already sends
through `sendPushToUser`, so it's a ready-made test path) and by
checking the bell updates live in a second browser session.
