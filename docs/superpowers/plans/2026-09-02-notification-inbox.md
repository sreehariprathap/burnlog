# In-App Notification Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every push notification (via one choke-point change to `sendPushToUser`, not the 18 call sites) as an in-app `Notification` row, surfaced as a bell icon + unread badge in `TopBar.tsx`, opening a `Drawer` list.

**Architecture:** One new Prisma model. `sendPushToUser` in `lib/pushNotification/server.ts` inserts the `Notification` row before attempting delivery (so it's recorded even with zero push subscriptions or a delivery failure) — zero changes to any of the 18 existing callers. Two new API routes. One new component wired into the shared `TopBar.tsx`, which also gets a pre-existing missing-`learnlog`-case bug fixed in the same pass.

**Tech Stack:** Next.js App Router, Supabase JS client + Realtime, existing `Drawer` primitives, existing `formatRelative` helper.

**Spec:** `docs/superpowers/specs/2026-09-02-notification-inbox-design.md`

## Global Constraints

- The `Notification` insert inside `sendPushToUser` must never throw in a way that aborts push delivery — wrap it in its own try/catch, log on failure, continue regardless.
- No changes to any of the 18 existing `sendPushToUser` call sites.
- No automated tests — verify manually via `npm run dev` + `npx tsc --noEmit` + `npm run build`.

---

### Task 1: Schema + `sendPushToUser` persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/pushNotification/server.ts`

- [ ] **Step 1: Add the `Notification` model**

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

Add `Notification[]` to `model Profile`'s relation block.

- [ ] **Step 2: Push schema**

Run: `npx prisma db push && npx prisma generate`

- [ ] **Step 3: Persist in `sendPushToUser`, before the VAPID/delivery logic**

```ts
// lib/pushNotification/server.ts
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  try {
    const { data: recipient } = await supabase.from('profiles').select('id').eq('userId', userId).maybeSingle();
    if (recipient) {
      await supabase.from('notifications').insert({
        profileId: recipient.id,
        title: payload.title,
        message: payload.message,
        url: payload.url,
      });
    }
  } catch (notifError) {
    console.error('Error persisting notification record:', notifError);
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Push notifications are not configured on the server');
  }
  // ...rest of the function unchanged from here down
```

Insert this block immediately after the function signature, before the existing `if (!vapidPublicKey ...)` check — the notification record must be created even when push isn't configured or delivery fails, since that's the exact case this feature exists to cover.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit`. Expected: no errors.

```bash
git add prisma/schema.prisma lib/pushNotification/server.ts
git commit -m "feat(notifications): persist a Notification row on every sendPushToUser call"
```

---

### Task 2: API routes

**Files:**
- Create: `app/api/notifications/route.ts`
- Create: `app/api/notifications/read-all/route.ts`

- [ ] **Step 1: Create the list route**

```ts
// app/api/notifications/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
      admin
        .from('notifications')
        .select('id, title, message, url, read, createdAt')
        .eq('profileId', me.id)
        .order('createdAt', { ascending: false })
        .limit(30),
      admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profileId', me.id)
        .eq('read', false),
    ]);

    return NextResponse.json({ notifications: notifications ?? [], unreadCount: unreadCount ?? 0 });
  } catch (error) {
    console.error('list notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the mark-all-read route**

```ts
// app/api/notifications/read-all/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { error } = await admin.from('notifications').update({ read: true }).eq('profileId', me.id).eq('read', false);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mark notifications read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit`. Expected: no errors.

```bash
git add app/api/notifications
git commit -m "feat(notifications): list and mark-all-read API routes"
```

---

### Task 3: NotificationBell + TopBar wiring (+ learnlog bug fix)

**Files:**
- Create: `components/NotificationBell.tsx`
- Modify: `components/TopBar.tsx`

- [ ] **Step 1: Create `NotificationBell`**

```tsx
// components/NotificationBell.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  url: string;
  read: boolean;
  createdAt: string;
}

async function fetchNotifications() {
  const res = await apiFetch('/api/notifications');
  if (!res.ok) throw new Error('Failed to load notifications');
  return res.json() as Promise<{ notifications: NotificationRow[]; unreadCount: number }>;
}

export function NotificationBell() {
  const router = useRouter();
  const { profile } = useCurrentProfile();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR('notifications', fetchNotifications);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profileId=eq.${profile.id}` },
        () => {
          mutate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, mutate]);

  async function handleOpen() {
    setOpen(true);
    if ((data?.unreadCount ?? 0) > 0) {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      mutate();
    }
  }

  function handleClickNotification(n: NotificationRow) {
    setOpen(false);
    router.push(n.url);
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <>
      <button type="button" onClick={handleOpen} aria-label="Notifications" className="relative flex items-center justify-center">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Notifications</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {(data?.notifications.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No notifications yet.</p>
            )}
            {(data?.notifications ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClickNotification(n)}
                className="flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left hover:bg-accent"
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground/70">{formatRelative(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
```

- [ ] **Step 2: Wire it into `TopBar.tsx` and fix the missing `learnlog` case**

In `components/TopBar.tsx`, add the import:

```tsx
import { NotificationBell } from './NotificationBell';
```

Add `LearnLogMark` to the existing mark imports:

```tsx
import { LearnLogMark } from './LearnLogMark';
```

In the top-left icon switch, add a `learnlog` branch before the final `BurnLogMark` fallback:

```tsx
          ) : activeApp === 'travellog' ? (
            <TravelLogMark size={20} />
          ) : activeApp === 'learnlog' ? (
            <LearnLogMark size={20} />
          ) : (
            <BurnLogMark size={20} />
          )}
```

Add `<NotificationBell />` into the right-side actions row, next to `ThemeToggle`:

```tsx
        <ThemeToggle />
        <NotificationBell />
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Use the admin "Test Push Notifications" tool (`/profile`) to send yourself a test notification. Confirm the bell badge updates live (no refresh needed) via the Realtime subscription, open the drawer, confirm the notification appears and the badge clears, click a notification and confirm it navigates to the right URL. Also visit `/learnlog` and confirm the top-left icon now shows the LearnLog Blocks mark instead of "B".

- [ ] **Step 4: Commit**

```bash
git add components/NotificationBell.tsx components/TopBar.tsx
git commit -m "feat(notifications): bell icon + drawer in TopBar, fix missing learnlog case"
```

---

### Task 4: Full verification

- [ ] **Step 1:** Run `npx tsc --noEmit` (expect clean) then `npm run build` (expect clean compile). Revert any regenerated `public/sw.js`/`public/worker-*.js` before committing (PWA build output, not source).
- [ ] **Step 2:** Push: `git push`.

## Self-Review Notes

- **Spec coverage:** Schema + choke-point persistence (Task 1), API (Task 2), UI + learnlog bug fix (Task 3) — every spec section covered.
- **Placeholder scan:** none.
- **Type consistency:** `NotificationRow` in `NotificationBell.tsx` matches the exact columns selected in `GET /api/notifications` (Task 2). `sendPushToUser`'s public signature is unchanged, so all 18 existing callers remain valid with zero edits.
