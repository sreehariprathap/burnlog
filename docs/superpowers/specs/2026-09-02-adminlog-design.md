# AdminLog — Design Spec

Date: 2026-09-02

## Problem

Admin-only tooling is currently scattered and incomplete:

- `Profile.isAdmin` exists and gates a handful of sections bolted onto `/profile` (Test Push Notifications, Onboarding Pages, AI Model Settings).
- `Profile.enabledApps` lets a user choose which Log apps they see, but there's no way for an admin to disable an app platform-wide, or force it on/off for one specific user.
- `lib/devError.ts` + `DevErrorWatcher` show client errors live to whichever admin happens to have a tab open — nothing is persisted, nothing is visible to any other admin, and server/worker errors aren't captured at all.
- There's no way for an admin to invite someone or track who they've reached out to.
- There's no mechanism for rolling a work-in-progress feature out to a subset of users before a general release.

AdminLog consolidates all of this into one admin-only route group with a consistent data model.

## Non-goals

- Admin tiers / roles beyond the existing `Profile.isAdmin` boolean. Any admin can do anything in AdminLog, including making another user an admin.
- Gating signup behind invites. Signup stays fully open; `Invite` is an audit/courtesy record only, not an access gate.
- Rebuilding the existing admin tools (push test, onboarding pages, AI model settings) — they migrate into AdminLog's nav as-is.

## Data model

### Toggle / ToggleOverride

A single, unified mechanism for both "is this app on" and "is this beta feature on," because the resolution logic is identical for both.

```prisma
model Toggle {
  key              String   @id            // "app:moneylog", "feature:beta-x"
  type             String                  // 'app' | 'feature'
  label            String
  globallyEnabled  Boolean  @default(true)
  createdAt        DateTime @default(now())
  overrides        ToggleOverride[]
}

model ToggleOverride {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  toggle         Toggle   @relation(fields: [toggleKey], references: [key], onDelete: Cascade)
  toggleKey      String
  profile        Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId      String   @db.Uuid
  enabled        Boolean
  note           String?
  setByAdmin     Profile  @relation("ToggleOverrideSetBy", fields: [setByAdminId], references: [id])
  setByAdminId   String   @db.Uuid
  createdAt      DateTime @default(now())

  @@unique([toggleKey, profileId])
  @@map("adminlog_toggle_overrides")
}
```

**Resolution precedence** (per-user override beats everything; confirmed with user):

```ts
function resolveToggle(toggle: Toggle, override: ToggleOverride | null, profile: Profile): boolean {
  if (override) return override.enabled;
  if (!toggle.globallyEnabled) return false;
  if (toggle.type === 'app') {
    const appId = toggle.key.replace('app:', '');
    return profile.enabledApps.includes(appId);
  }
  return true; // feature flags: globally-on and no override means on
}
```

This function is the single source of truth. It's called:
- Server-side, in the layout for each `app/(<log>)` route group, to redirect if the app resolves to disabled for the current user.
- Server-side, in `middleware.ts` or a shared helper, before rendering the app switcher nav.
- Client-side (via a small hook wrapping the same logic, fed by data already loaded for the user) wherever a feature flag needs to gate a UI branch.

### ErrorLog

```prisma
model ErrorLog {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  source            String                    // 'client' | 'server' | 'worker'
  message           String
  stack             String?
  context           Json?                     // route, userId, jobName, requestId, etc.
  createdAt         DateTime @default(now())
  resolvedAt        DateTime?
  resolvedByAdmin   Profile? @relation(fields: [resolvedByAdminId], references: [id])
  resolvedByAdminId String?  @db.Uuid

  @@map("adminlog_error_logs")
}
```

- `lib/errorLog.ts` exports `logError(source: 'client'|'server'|'worker', error: unknown, context?: Record<string, unknown>): Promise<void>`, which writes directly to the DB (server/worker call this in-process, inside try/catch at each API route handler's top level and each worker job's top level).
- Client errors: `lib/devError.ts`'s existing `reportDevError()` gains a second effect — alongside notifying live subscribers (unchanged, `DevErrorWatcher` keeps working exactly as today), it also does a fire-and-forget `fetch('/api/admin/errors', { method: 'POST', body: ... })` so the error is persisted even when no admin is watching. The POST handler calls `logError('client', ...)`.
- No new capture point needed in `DevErrorWatcher` itself — it stays a live, ephemeral view; persistence is a parallel path, not a replacement.

### Invite

```prisma
model Invite {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email             String
  invitedByAdmin    Profile   @relation(fields: [invitedByAdminId], references: [id])
  invitedByAdminId  String    @db.Uuid
  status            String    @default("pending") // 'pending' | 'signed_up'
  createdAt         DateTime  @default(now())
  signedUpAt        DateTime?

  @@map("adminlog_invites")
}
```

- Admin submits an email in `/adminlog/invites` → server action creates the row and sends an email (reuse whatever transactional-email mechanism the app already has for notifications, if any — otherwise this needs its own small mailer, flagged as a follow-up scope question during implementation planning if none exists) with a link to the normal, ungated `/signup` page.
- On successful signup, if the new user's email matches a `pending` `Invite`, mark it `signed_up` + `signedUpAt` (best-effort join by email; not a gate).
- `middleware.ts` and `/signup` are **not** touched — signup behavior is unchanged.

## Permission & routing

- Reuse `Profile.isAdmin` exactly as it exists today. No new tiers.
- New route group `app/(adminlog)/adminlog/` with sub-routes:
  - `/adminlog` — dashboard (unresolved error count, recent errors, active toggles summary)
  - `/adminlog/toggles` — CRUD for `Toggle` + `ToggleOverride`
  - `/adminlog/errors` — filterable `ErrorLog` browser (by source, date range, resolved/unresolved) with a "mark resolved" action
  - `/adminlog/invites` — send + track invites
  - `/adminlog/tools` — migrated destination for the existing `/profile` admin sections (Test Push Notifications, Onboarding Pages, AI Model Settings); those components move here largely unchanged, each still gated by the same `isAdmin` check they already have
- `app/(adminlog)/adminlog/layout.tsx` checks `profile.isAdmin` server-side and redirects non-admins to `/logbook` (matches the existing pattern other protected routes use).
- `AdminLog` is **not** added to `lib/appMode.ts`'s `APPS` map — it must never appear in the normal app switcher for non-admin users. It gets its own small nav entry point (e.g. a link shown only when `profile.isAdmin` is true, similar to how the existing admin sections are conditionally rendered today).

## Migration of existing admin tools

The three admin sections currently in `app/profile/page.tsx` (~lines 401-497) move into `app/(adminlog)/adminlog/tools/page.tsx`:
- Test Push Notifications
- Onboarding Pages (`OnboardingPageTogglesModal`, backed by the existing `OnboardingPageFlag` model — left as-is, this is a separate pre-existing flag system and out of scope to unify with `Toggle`)
- AI Model Settings

`/profile` loses these sections entirely (not duplicated) once the move is done, so there's a single admin surface instead of two.

## Testing

- `resolveToggle()` is a pure function — unit tests cover all combinations of (override present/absent) × (global on/off) × (type app/feature) × (user's own enabledApps contains/doesn't).
- `logError()` — test that it writes a row with the right `source`/`context` shape for each of the three call sites (a mocked API route throw, a mocked worker job throw, a client `reportDevError` call hitting the POST route).
- Invite flow — test that a signup with a matching pending invite email marks it `signed_up`, and that an unrelated signup (no invite) succeeds unaffected.
- Route gating — test that a non-admin hitting any `/adminlog/*` route is redirected, and an admin is not.

## Open questions for implementation planning

- Whether an existing transactional-email mechanism exists to reuse for `Invite` emails, or whether one needs to be introduced (push notifications already exist via `PushSubscription`, but that's not email).
