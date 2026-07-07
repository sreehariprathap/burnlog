# iOS Push Notification Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make push notifications actually deliver on every platform (they currently don't, anywhere), gate them correctly for iOS's install-required requirement, and add an admin-only way to verify real delivery.

**Architecture:** Migrate `next-pwa` from its auto-generated service worker (`runtimeCaching` config) to a custom `worker/index.js` (`swSrc`) that reimplements the same caching rules via direct Workbox imports and adds `push`/`notificationclick` listeners. Add iOS install-detection to the existing notification-prompt UI. Add a real test-send path gated behind a new `profiles.isAdmin` flag.

**Tech Stack:** Next.js 15 App Router, `next-pwa` 5.6.0, Workbox (via `workbox-routing`/`workbox-strategies`/`workbox-precaching`/`workbox-expiration`), `web-push` (already wired server-side), Supabase.

## Global Constraints

- Push payload shape is fixed: `{title, message, url}` — matches what `app/api/notifications/send/route.ts` already sends. Don't change that endpoint's contract.
- Notification icon assets: use `/icons/icon-192.png` (icon) and `/icons/icon-96.png` (badge) — the real sized PWA icons already generated in `public/icons/`, not `/B.png`.
- `next-pwa`'s service worker (and therefore push) is only generated in production builds — `next.config.ts` has `disable: process.env.NODE_ENV === 'development'`. Any verification of the service worker itself MUST use `npm run build && npm start`, not `npm run dev`.
- `isAdmin` has no grant UI — it's flipped via a direct SQL update. Don't build one.
- No scheduled/automatic notification sending in this plan — this is delivery plumbing + a manual admin test path only.

---

### Task 1: Add `isAdmin` to Profile schema

**Files:**
- Modify: `prisma/schema.prisma` (`Profile` model)

**Interfaces:**
- Produces: `profiles.isAdmin` (boolean, default `false`) — read in Task 5 (`PushNotificationPrompt`) and Task 6 (`/profile` page).

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, find the `Profile` model's `aiEnabled`/`lifestyle` lines (added in an earlier feature) and add `isAdmin` alongside them:

```prisma
  activityLevel String
  aiEnabled     Boolean  @default(false)
  lifestyle     Json?
  isAdmin       Boolean  @default(false)
```

- [ ] **Step 2: Push the schema**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Verify the column**

Use `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'profiles' and column_name = 'isAdmin';
```
Expected: one row — `boolean`, not nullable, default `false`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
Add isAdmin field to Profile

Gates the admin-only test-push feature. No grant UI - set directly
via SQL on a specific profile row.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Align Workbox package versions

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `workbox-routing`, `workbox-strategies`, `workbox-expiration` as direct dependencies at the same major/minor as the already-installed `workbox-core`/`workbox-precaching` (7.4.1) — consumed by `worker/index.js` in Task 3.

- [ ] **Step 1: Check current versions**

Run:
```bash
for p in workbox-core workbox-precaching workbox-routing workbox-strategies workbox-expiration; do
  echo "$p: $(node -p "require('./node_modules/$p/package.json').version")"
done
```
Expected (before this task): `workbox-core`/`workbox-precaching` at `7.4.1`, but `workbox-routing`/`workbox-strategies`/`workbox-expiration` at `6.6.0` (transitive deps pulled in by `next-pwa`, not version-aligned with our direct deps). Mixing Workbox major versions in one service worker risks runtime incompatibilities, so we pin all five to match.

- [ ] **Step 2: Install matching versions**

Run: `npm install workbox-routing@^7.4.1 workbox-strategies@^7.4.1 workbox-expiration@^7.4.1`

- [ ] **Step 3: Verify versions now match**

Re-run the loop from Step 1.
Expected: all five packages report `7.4.1`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
Add workbox-routing/strategies/expiration as direct deps at 7.4.1

Previously only pulled in transitively via next-pwa at 6.6.0 -
mismatched with our direct workbox-core/workbox-precaching at 7.4.1.
Needed as explicit imports in the upcoming custom service worker.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Custom service worker with push support

**Files:**
- Create: `worker/index.js`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: push payload shape `{title, message, url}` (Global Constraints); icon paths `/icons/icon-192.png` / `/icons/icon-96.png`.
- Produces: `public/sw.js` (build output) with a working `push` and `notificationclick` handler, and caching behavior equivalent to today's. Consumed by Task 7's live verification.

- [ ] **Step 1: Create the custom service worker source**

```js
// worker/index.js
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// "/" - same NetworkFirst + opaqueredirect workaround next-pwa's default template used
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname === '/',
  new NetworkFirst({
    cacheName: 'start-url',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          response && response.type === 'opaqueredirect'
            ? new Response(response.body, { status: 200, statusText: 'OK', headers: response.headers })
            : response,
      },
    ],
  })
);

registerRoute(
  ({ url }) => /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:eot|otf|ttc|ttf|woff|woff2|font\.css)$/i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'static-font-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:jpg|jpeg|gif|png|webp|svg|ico)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'static-image-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:js|css)$/i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'static-js-css-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 })],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 60 * 5 })],
  })
);

// Catch-all - must be registered last (Workbox matches routes in registration order)
registerRoute(
  () => true,
  new NetworkFirst({
    cacheName: 'others',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 })],
  })
);

const FALLBACK_URLS = {
  document: '/offline',
  image: '/B.png',
  audio: '/offline',
  video: '/offline',
  font: '/offline',
};

setCatchHandler(async ({ request }) => {
  const fallbackUrl = FALLBACK_URLS[request.destination];
  if (fallbackUrl) {
    const cached = await caches.match(fallbackUrl);
    if (cached) return cached;
  }
  return Response.error();
});

self.addEventListener('push', (event) => {
  let payload = { title: 'burnlog Notification', message: 'You have a new notification', url: '/' };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Malformed/non-JSON payload - keep the generic fallback above
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.message,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      try {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = allClients.find((client) => new URL(client.url).origin === self.location.origin);

        if (existing) {
          await existing.focus();
          if (new URL(existing.url).pathname !== targetUrl) {
            await existing.navigate(targetUrl);
          }
          return;
        }

        await self.clients.openWindow(targetUrl);
      } catch (err) {
        console.error('notificationclick handling failed:', err);
      }
    })()
  );
});
```

- [ ] **Step 2: Point next-pwa at the custom source**

In `next.config.ts`, replace the `fallbacks`/`runtimeCaching` keys (both only apply in
next-pwa's auto-generated mode, which we're leaving) with `swSrc`:

```ts
export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  swSrc: 'worker/index.js'
})(nextConfig);
```

Remove the `fallbacks: {...}` and `runtimeCaching: [...]` blocks entirely — their behavior is
now in `worker/index.js`'s `setCatchHandler` and `registerRoute` calls above.

- [ ] **Step 3: Build and inspect the output**

Run: `npm run build`
Expected: build succeeds (exit 0).

Run: `grep -c "addEventListener(\"push\"" public/sw.js`
Expected: `1` (confirms the push handler made it into the built service worker; note the build
output is minified, so this exact string may differ slightly — if it doesn't match, run
`grep -o "push" public/sw.js | wc -l` instead and confirm it's non-zero, then visually confirm
by reading `public/sw.js` for `showNotification` and `notificationclick`).

- [ ] **Step 4: Verify no build regressions**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add worker/index.js next.config.ts
git commit -m "$(cat <<'EOF'
Migrate to custom service worker with push notification support

next-pwa's auto-generated sw.js can't have custom code appended - it's
regenerated every build from the runtimeCaching config. Switches to
swSrc with a hand-written worker/index.js that reimplements the same
caching rules via direct Workbox imports (mechanical translation, not
a behavior change) and adds the push/notificationclick handlers that
were entirely missing before - real push notifications never
displayed on any platform without this.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Real test-send function

**Files:**
- Modify: `lib/pushNotification.ts`

**Interfaces:**
- Produces: `sendRealTestNotification(): Promise<{ success: boolean; error?: string }>` — consumed by Task 5 and Task 6.
- Note: `sendTestNotification` (the old local-notification function) still exists after this
  task and is still called from `PushNotificationPrompt.tsx` — it gets removed in Task 5, once
  its only caller is rewired. Don't remove it yet or `tsc` breaks mid-task.

- [ ] **Step 1: Add the function**

In `lib/pushNotification.ts`, add this new export (anywhere after the existing imports/types,
e.g. right before the `sendTestNotification` function it will eventually replace):

```ts
// Calls the real server-side push endpoint - unlike sendTestNotification, this exercises
// actual delivery through the service worker's push handler.
export async function sendRealTestNotification(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'burnlog Test',
        message: 'This is a real push notification from burnlog!',
        url: '/dashboard',
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || body.message || 'Failed to send test notification' };
    }
    if (!body.success) {
      return { success: false, error: 'No devices received the notification' };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test notification',
    };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pushNotification.ts
git commit -m "$(cat <<'EOF'
Add sendRealTestNotification for real push delivery testing

Calls /api/notifications/send directly, unlike sendTestNotification
which only ever showed a local notification and never tested real
delivery. Old function is removed in the next task once its call
site is rewired.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: iOS gating + admin test button in the enable flow

**Files:**
- Modify: `app/dashboard/_components/PushNotificationPrompt.tsx`
- Modify: `lib/pushNotification.ts` (remove now-dead `sendTestNotification`)

**Interfaces:**
- Consumes: `sendRealTestNotification()` from Task 4; `profiles.isAdmin` from Task 1.

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `app/dashboard/_components/PushNotificationPrompt.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { registerServiceWorker, subscribeToPushNotifications, sendRealTestNotification } from '@/lib/pushNotification';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from '@/components/ui/use-toast';

type Platform = { isIOS: boolean; isStandalone: boolean };

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return { isIOS, isStandalone };
}

export function PushNotificationPrompt() {
  const supabase = createClientComponentClient();
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'default'>('default');
  const [loading, setLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkPermission = async () => {
      if (!('Notification' in window)) {
        return;
      }

      setPlatform(detectPlatform());
      setPermissionState(Notification.permission);

      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUserId(data.user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('isAdmin')
          .eq('userId', data.user.id)
          .single();
        setIsAdmin(!!profile?.isAdmin);

        if (Notification.permission !== 'granted') {
          setShowPrompt(true);
        }
      }
    };

    checkPermission();

    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }
  }, [supabase]);

  const handleEnableNotifications = async () => {
    if (!userId) {
      toast({
        title: "User not logged in",
        description: "You need to be logged in to enable notifications",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const success = await subscribeToPushNotifications(userId, async (subscription) => {
        const { error } = await supabase
          .from('push_subscriptions')
          .upsert({
            user_id: userId,
            subscription_data: subscription,
            created_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) {
          console.error("Error saving subscription:", error);
          throw error;
        }
      });

      if (success) {
        setPermissionState('granted');
        toast({
          title: "Notifications enabled!",
          description: "You'll now receive workout reminders and updates",
        });
        setShowPrompt(false);
      } else {
        toast({
          title: "Couldn't enable notifications",
          description: "Please check your browser settings and try again",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      toast({
        title: "Error",
        description: "Something went wrong while enabling notifications",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTestSending(true);
    const result = await sendRealTestNotification();
    if (result.success) {
      toast({ title: "Test push sent", description: "Check for a real notification on this device." });
    } else {
      toast({ title: "Test push failed", description: result.error || "Unknown error", variant: "destructive" });
    }
    setTestSending(false);
  };

  if (!platform) return null;

  if (permissionState === 'granted') {
    if (!isAdmin) return null;
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Send Test Push</CardTitle>
          <CardDescription>Admin only - verify real push delivery</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={handleSendTestPush} disabled={testSending}>
            {testSending ? 'Sending...' : 'Send Test Push'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!showPrompt) return null;

  if (platform.isIOS && !platform.isStandalone) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Enable Notifications</CardTitle>
          <CardDescription>Add burnlog to your Home Screen first</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            iOS only supports notifications for apps added to your Home Screen. Tap the Share
            button in Safari, then &quot;Add to Home Screen&quot;. Once installed, open burnlog
            from your Home Screen and come back here to enable notifications.
          </p>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button variant="outline" onClick={() => setShowPrompt(false)}>
            Got it
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Enable Notifications</CardTitle>
        <CardDescription>
          Get reminders about your scheduled workouts and progress updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Stay on track with your fitness goals by enabling push notifications. We&apos;ll send you timely reminders
          for your workout sessions and celebrate your achievements.
        </p>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setShowPrompt(false)}>
          Maybe Later
        </Button>
        <Button onClick={handleEnableNotifications} disabled={loading}>
          {loading ? 'Enabling...' : 'Enable Notifications'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Remove the now-dead local-notification function**

In `lib/pushNotification.ts`, delete the entire `sendTestNotification` function (it has no
callers left after Step 1):

```ts
// Function to send a test notification
export async function sendTestNotification() {
  if (!('Notification' in window)) {
    alert('This browser does not support notifications');
    return;
  }

  if (Notification.permission !== 'granted') {
    alert('Please enable notifications first');
    return;
  }

  // This would normally be handled by your server
  // But for testing, we can trigger it directly
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    registration.showNotification('burnlog Test', {
      body: 'This is a test notification from burnlog!',
      icon: '/B.png',
      badge: '/B.png',
      data: {
        url: '/dashboard'
      }
    });
  }
}
```

- [ ] **Step 3: Verify no other callers exist**

Run: `grep -rn "sendTestNotification" app lib components`
Expected: no output (confirms it's fully removed, not just unreferenced).

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/_components/PushNotificationPrompt.tsx lib/pushNotification.ts
git commit -m "$(cat <<'EOF'
Add iOS install gating and admin test-push button to notification prompt

iOS Safari only supports Web Push for an installed (Add to Home
Screen) PWA, never a plain browser tab - detects this and shows
install instructions instead of a button that would silently fail.
Once notifications are enabled, admins (profiles.isAdmin) see a real
test-send button instead of the old fake local notification.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Admin test-push card on Profile page

**Files:**
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `sendRealTestNotification()` from Task 4; `profiles.isAdmin` from Task 1.

- [ ] **Step 1: Extend the profile select and imports**

In `app/profile/page.tsx`, extend the existing select (already includes `aiEnabled` from an
earlier feature) to also fetch `isAdmin`:

```ts
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin')
          .eq('userId', userId)
          .single();
```

Add `Bell` to the lucide-react import (alongside the existing `Sparkles`):
```ts
import { Loader2, Info, AlertTriangle, Sparkles, Bell } from 'lucide-react';
```

Add the import for the test-send function, alongside the existing supabase import:
```ts
import { sendRealTestNotification } from '@/lib/pushNotification';
```

- [ ] **Step 2: Add test-sending state and handler**

Alongside the other `useState` calls in `ProfilePage`:
```ts
  const [testSending, setTestSending] = useState(false);
```

Add this handler near `handleLogout`:
```ts
  const handleSendTestPush = async () => {
    setTestSending(true);
    const result = await sendRealTestNotification();
    if (result.success) {
      alert('Test push sent - check for a real notification on this device.');
    } else {
      alert(`Test push failed: ${result.error || 'Unknown error'}`);
    }
    setTestSending(false);
  };
```
(Uses `alert` to match this file's existing lack of a toast dependency in this component -
`use-toast` isn't imported here today, and pulling it in is out of scope for this task.)

- [ ] **Step 3: Add the admin-gated card**

Insert this right after the "AI Insights" card block added by an earlier feature (i.e. right
before the final `<div className="mt-6 text-center">` logout section):

```tsx
            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-amber-500" />
                      Test Push Notifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - send yourself a real push notification to verify delivery.
                    </p>
                    <Button onClick={handleSendTestPush} disabled={testSending}>
                      {testSending ? 'Sending...' : 'Send Test Push'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/profile/page.tsx
git commit -m "$(cat <<'EOF'
Add admin-gated test-push card to Profile page

Lets delivery be re-tested anytime without re-running the enable
flow.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: exit 0, route table printed with no errors.

- [ ] **Step 3: Start the production server**

Run: `npm start` (in the background - this serves the actual built `public/sw.js`, unlike
`npm run dev` which skips service worker generation entirely per the `disable` config).

- [ ] **Step 4: Create a disposable admin test user**

Use `mcp__supabase__execute_sql` (same pattern used for prior disposable test users this
session):
```sql
do $$
declare
  new_user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    'push-verify@example.com', crypt('PushVerify123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );
  insert into auth.identities (provider, provider_id, user_id, identity_data, created_at, updated_at, last_sign_in_at)
  values (
    'email', new_user_id, new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'push-verify@example.com', 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );
  insert into profiles ("userId", "firstName", "lastName", age, weight, height, "activityLevel", "isAdmin")
  values (new_user_id, 'Push', 'Verify', 30, 75, 178, 'moderate', true);
end $$;
```

- [ ] **Step 5: Chrome end-to-end verification**

Using the chrome-devtools MCP tool, pointed at `http://localhost:3000` (the production server
from Step 3, not the dev server): log in as `push-verify@example.com` / `PushVerify123!`. On
`/dashboard`, confirm the "Enable Notifications" card renders (non-iOS Chrome path). Click
Enable, accept the browser's permission prompt. Confirm the card is replaced by "Send Test
Push" (proving the `isAdmin` gate works). Click it. Confirm:
- A real OS-level notification appears (not just an in-page toast) — check via
  `mcp__chrome-devtools__list_console_messages` for any errors, and visually via a screenshot
  if the notification is still visible.
- Clicking the notification focuses the existing tab (or opens a new one) at `/dashboard`.

- [ ] **Step 6: Verify caching parity**

Using chrome-devtools, reload `/dashboard` a second time. Use
`mcp__chrome-devtools__list_network_requests` and confirm at least one image/font/JS asset
request shows as served from cache (not re-fetched over the network), matching the
`CacheFirst`/`StaleWhileRevalidate` behavior configured in `worker/index.js`.

- [ ] **Step 7: Clean up test data**

```sql
delete from profiles where "userId" in (select id from auth.users where email = 'push-verify@example.com');
delete from auth.users where email = 'push-verify@example.com';
```
Verify: `select count(*) from auth.users where email = 'push-verify@example.com';` returns `0`.

- [ ] **Step 8: Stop the production server**

Stop the `npm start` background process.

- [ ] **Step 9: Report real-device follow-up**

Tell the user: Chrome-based verification above is complete; a real iOS Safari pass (install
via Add to Home Screen, enable notifications, confirm a real push arrives) is theirs to do on
a physical device per the agreed plan - this cannot be verified through Chrome automation.
