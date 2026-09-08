# Admin-managed loading animations — design

## Context

App-switch loading screens (`SwitchLoader` / `MultiStepLoader`) currently show
a Lottie animation above the text checklist for 5 apps, via a hardcoded
`Record<AppId, string>` map of static file paths in
`components/SwitchLoader.tsx`, pointing at files under `public/lottie/`.
Intellog is a separate hardcoded case, always showing `<SiriOrb>`. The other
6 apps show no icon (text-only loader, unchanged from before this feature
existed).

This spec lets an admin manage this from `/adminlog/loading-animations`:
paste or upload new Lottie JSON, preview any animation, and assign one
animation (or none) to each of the 12 apps — including intellog, whose Siri
orb becomes a selectable built-in entry rather than a hardcoded exception.
The 5 existing files remain available as read-only built-ins.

## Data model

Two new Prisma models.

```prisma
model LottieAnimation {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String
  kind             String   @default("lottie") // 'lottie' | 'siri_orb'
  isReadOnly       Boolean  @default(false)
  filePath         String?  // set only for the 5 built-in files under public/lottie/
  data             Json?    // set only for admin-uploaded/pasted animations
  createdByAdminId String?  @db.Uuid
  createdAt        DateTime @default(now())

  assignments AppLottieAssignment[]

  @@map("adminlog_lottie_animations")
}

model AppLottieAssignment {
  appId            String   @id // one row per AppId, including 'intellog'
  animationId      String?  @db.Uuid
  animation        LottieAnimation? @relation(fields: [animationId], references: [id], onDelete: SetNull)
  updatedAt        DateTime @updatedAt
  updatedByAdminId String?  @db.Uuid

  @@map("adminlog_lottie_assignments")
}
```

Invariant (enforced in application code, not a DB constraint): for
`kind = 'lottie'`, exactly one of `filePath` / `data` is set. For
`kind = 'siri_orb'`, both are null — `AppSwitchLottie` renders `<SiriOrb>`
instead of a Lottie player when it sees this kind.

### Seed

A one-time script, `prisma/seed-loading-animations.js`, following the
existing `prisma/seed-*.js` convention: reads the 5 files from
`public/lottie/*.json` (just to get their names — file bytes stay on disk,
`filePath` is what's stored, not `data`), inserts them as `isReadOnly: true`
rows, inserts one `isReadOnly: true`, `kind: 'siri_orb'` row named "Siri Orb
(IntelLog default)", then inserts the 6 default assignments (burnlog,
moneylog, sociallog, travellog, adminlog → their file; intellog → the Siri
orb row). This reproduces exactly what's live today — migrating changes
nothing visible until an admin acts.

## API routes

Mirrors the existing `announcements` (public read) / `adminlog/banners`
(admin CRUD) split, reusing `requireAdminCaller` for the admin-only routes
and `createServiceRoleClient` to bypass RLS from within them (both already
used by `app/api/adminlog/banners/route.ts`).

**Public (any authenticated user):**

- `GET /api/loading-animations` — returns, for every `AppId`:
  `{ [appId]: { src: string, kind: 'lottie' } | { src: null, kind: 'siri_orb' } | null }`.
  `src` is the static `/lottie/*.json` path for file-backed rows, or
  `/api/loading-animations/[id]` for DB-stored ones. `null` means
  unassigned — caller falls back to text-only, same as an app not in
  today's hardcoded map.
- `GET /api/loading-animations/[id]` — streams that row's `data` column as
  `Content-Type: application/json`. Only ever reached for DB-stored rows;
  file-backed rows are fetched directly from their static path and never
  hit this route. 404 if the row doesn't exist or has no `data` (e.g. it's
  a `siri_orb` row — callers shouldn't construct this URL for one, but the
  route guards it anyway).

**Admin-only** (`requireAdminCaller`, 403 otherwise):

- `GET /api/adminlog/loading-animations` — full list: `id`, `name`, `kind`,
  `isReadOnly`, whether `data`/`filePath` is set (not the data itself — keep
  the list payload light), plus the current 12 assignments.
- `POST /api/adminlog/loading-animations` — body `{ name: string, data: object }`.
  Validates: `name` non-empty, `data` is a JSON object with an array
  `layers` field (minimal Lottie-shape check), `JSON.stringify(data).length`
  ≤ 2MB (comfortably above the largest built-in, ~756KB). Inserts with
  `kind: 'lottie'`, `isReadOnly: false`, `createdByAdminId` from the caller.
  400 with a specific message on any validation failure.
- `DELETE /api/adminlog/loading-animations/[id]` — 400 if `isReadOnly`.
  Assignments pointing at it fall back to `null` via `onDelete: SetNull`.
- `PUT /api/adminlog/loading-animations/assignments` — body
  `{ appId: AppId, animationId: string | null }`. Upserts one row (`appId`
  is the primary key, so one row per app always).

## Frontend

**`components/AppSwitchLottie.tsx`** — prop renamed `path: string` →
`src: string | object`, plus a `kind?: 'lottie' | 'siri_orb'`. When
`kind === 'siri_orb'`, renders `<SiriOrb state="thinking" size="96px" />`
instead of `<Lottie>`. Used both by `SwitchLoader` (the real transition) and
the admin page (previews — `src` there is the animation object directly,
already in hand, no extra fetch).

**`lib/loadingAnimations.ts`** (new) — a small SWR-backed hook,
`useAppSwitchLottie()`, wrapping `GET /api/loading-animations`. Reasonable
`dedupingInterval` since this changes rarely; no revalidate-on-focus.
`SwitchLoader` drops `APP_SWITCH_LOTTIE` and `switchIcon()`'s hardcoded
`intellog` branch entirely, replacing both with one lookup into this hook's
result — every app, including intellog, resolves the same way now.

**`app/(adminlog)/adminlog/loading-animations/page.tsx`** (new), added to
`lib/adminlog/nav.ts` under the `ui-themes` category, following the
`app-icons` page's shape (`useRequireAdmin`, `Card`s, live preview grid):

- Animation library: grid of cards (name, `<AppSwitchLottie>` preview
  looping, "Built-in" lock badge + disabled delete for read-only rows, an
  enabled delete for custom ones).
- "Add animation" dialog: name field, a tab/toggle between a JSON paste
  `<textarea>` and a file `<input type="file" accept=".json">` (read
  client-side via `file.text()`, both paths converge on the same
  `JSON.parse` + POST). Inline error message on validation failure from the
  API.
- Assignment list: one row per `AppId` (all 12, including intellog) — app
  name/color swatch, a `<Select>` of animation names (grouped: built-ins,
  then custom) plus "None", and a small live preview of the currently
  assigned one. Selecting fires the `PUT .../assignments` call and
  optimistically updates.

## Error handling

- Invalid JSON paste/upload → inline error in the dialog, nothing sent to
  the API (client-side `JSON.parse` catch) — and the API re-validates
  regardless, since the client check is a UX nicety, not the source of
  truth.
- Oversized payload → 400 from the API with a clear "too large" message.
- Deleting a read-only row → 400, dialog/button is disabled client-side too
  so this mainly guards direct API calls.
- `GET /api/loading-animations` failing (network blip) → `SwitchLoader`
  falls back to no icon (text-only loader) for every app that turn, same
  degraded-but-functional behavior as an app with no assignment.

## Testing

- Seed script run against a local DB, verify the 6 default assignments
  match current hardcoded behavior exactly (manual check: switch to each of
  the 6 apps, compare against pre-change screenshots).
- Admin page: paste a valid animation, upload a valid `.json` file, attempt
  an invalid paste (expect inline error), attempt deleting a built-in
  (expect it to be disabled), reassign an app and confirm the next
  app-switch reflects it.
- Confirm a custom (DB-stored) animation's `/api/loading-animations/[id]`
  route requires auth (401 unauthenticated) — unlike the static
  `/lottie/*.json` files, which stay public per the earlier middleware fix.
