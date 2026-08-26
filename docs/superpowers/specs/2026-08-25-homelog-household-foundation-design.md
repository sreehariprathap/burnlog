# HomeLog — Household Foundation — Design (Sub-Project 1)

**Date:** 2026-08-25
**Status:** Approved design, pending spec review
**Parent effort:** Add a fourth app "HomeLog" combining household chores/maintenance, home inventory/shopping, and shared living (bill-splitting, chore rotation) alongside BurnLog/LifeLog/TaskLog. This spec covers **only the multi-user household foundation** — a real `Household` entity, invite-by-username flow, membership, and roles. Chores/maintenance, inventory/shopping, and bill-splitting are **separate follow-up sub-projects**, each brainstormed once this foundation exists.

## Goal

Every existing app in this codebase is single-owner: one `profileId`, one set of rows, RLS scoped to "you." HomeLog's whole premise — shared chores, shared bills, shared inventory — requires multiple real accounts to read and write the same data. This spec builds that foundation: a `Household` a profile can create or be invited into, real membership with owner/member roles, and a minimal HomeLog shell (shell + one home page) on top of it. No chores, no inventory, no bills yet — just "create or join a household, see who's in it."

## Non-Goals

- Chores/maintenance tracking, inventory/shopping lists, bill-splitting — all separate follow-up specs built on top of this foundation.
- Multiple households per profile (one household per profile for v1 — enforced at the DB level).
- Shareable invite links/codes — invites are by username only, reusing the existing friend-request pattern.
- Real-time sync (websockets/live updates) between household members — members see shared state on page load/refresh, same as every other app's data fetching today.

## Decisions (locked during brainstorming)

1. **Multi-user is real:** actual separate accounts, not text-label "assigned to" fields.
2. **One household per profile**, enforced via a `@unique` constraint on `HouseholdMember.profileId`.
3. **Invite by username**, mirroring the existing friend-request flow (`app/api/social/requests`) exactly — no new invite-link/token infrastructure.
4. **Roles:** `owner` (creator; can rename/delete household, remove members) and `member` (full access to shared data once it exists; can invite; cannot remove others or delete the household). Anyone can leave at any time.
5. **Sequencing:** this foundation ships first, alone; chores/inventory/bills are brainstormed as separate sub-projects afterward.
6. **Mutation pattern:** all household writes (create/invite/accept/decline/leave/remove) go through service-role API routes with explicit server-side authorization — mirrors `app/api/social/*` exactly, not client-side RLS-gated writes.

## Architecture

### Shell extension

Same mechanism used to add LifeLog and TaskLog:

- `lib/appMode.ts`: `AppId` gains `'homelog'`; `APPS.homelog = { id: 'homelog', name: 'HomeLog', tagline: 'Run your household together', home: '/homelog', themeClass: 'app-homelog' }`.
- `app/(homelog)/layout.tsx`: adds `.app-homelog`, removes the other three theme classes; the other three layouts are updated to also remove `.app-homelog` (same fix already applied for `.app-tasklog` when it was added).
- `components/HomeLogMark.tsx`: bold "H" letterform, same style/pattern as `LifeLogMark`/`TaskLogMark`.
- `components/HomeLogBottomNav.tsx` + `components/HomeLogProfileMenu.tsx`: same pattern as the other two, but with a single "Home" tab for now (no Chores/Inventory/Bills tabs until those sub-projects land).
- `components/AppSwitcher.tsx` / `components/TopBar.tsx` / `components/SplashScreen.tsx`: extend the per-app ternaries/maps to include `'homelog'` — the exact same three call sites TaskLog needed (and the SplashScreen one the earlier TaskLog pass initially missed, so this time it's included in the plan from the start).
- `app/globals.css`: new `.app-homelog` / `.app-homelog.dark` blocks — warm terracotta/clay palette (muted reddish-brown), distinct from BurnLog's bright orange, LifeLog's teal, and TaskLog's blue.

### Data model (Prisma)

```prisma
model Household {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  createdAt DateTime @default(now())
  members   HouseholdMember[]
  invites   HouseholdInvite[]

  @@map("households")
}

model HouseholdMember {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId String    @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId   String    @unique @db.Uuid
  role        String    @default("member") // 'owner' | 'member'
  joinedAt    DateTime  @default(now())

  @@map("household_members")
}

model HouseholdInvite {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId String    @db.Uuid
  invitedBy   Profile   @relation("HouseholdInviteSender", fields: [invitedById], references: [id])
  invitedById String    @db.Uuid
  invitee     Profile   @relation("HouseholdInviteRecipient", fields: [inviteeId], references: [id])
  inviteeId   String    @db.Uuid
  status      String    @default("pending") // 'pending' | 'accepted' | 'declined'
  createdAt   DateTime  @default(now())
  respondedAt DateTime?

  @@map("household_invites")
}
```

`Profile` gains relation fields: `HouseholdMember HouseholdMember?`, `householdInvitesSent HouseholdInvite[] @relation("HouseholdInviteSender")`, `householdInvitesReceived HouseholdInvite[] @relation("HouseholdInviteRecipient")`.

`profileId @unique` on `HouseholdMember` is the actual enforcement of "one household per profile" — an insert attempting to add a second membership row for the same profile fails at the DB level, not just in application logic.

### RLS

Defensive, read-only policies mirroring the existing `friendships` table pattern exactly (see `supabase/rls.sql`'s comment: social tables aren't read/written directly by the client for mutations, but RLS is still enabled as a defensive default):

```sql
alter table households enable row level security;
create policy "households_member_read" on households
  for select using (
    exists (
      select 1 from household_members hm
      join profiles p on p.id = hm."profileId"
      where hm."householdId" = households.id and p."userId" = auth.uid()
    )
  );

alter table household_members enable row level security;
create policy "household_members_read" on household_members
  for select using (
    exists (
      select 1 from household_members hm2
      join profiles p on p.id = hm2."profileId"
      where hm2."householdId" = household_members."householdId" and p."userId" = auth.uid()
    )
  );

alter table household_invites enable row level security;
create policy "household_invites_read_own" on household_invites
  for select using (
    exists (select 1 from profiles p where p.id = household_invites."inviteeId" and p."userId" = auth.uid())
    or exists (select 1 from profiles p where p.id = household_invites."invitedById" and p."userId" = auth.uid())
  );
```

No client-side insert/update/delete policies — every mutation happens through the API routes below via the service-role client, which bypasses RLS and does its own authorization (identical posture to `friendships`/`app/api/social/*`).

### API routes (service-role client, mirrors `app/api/social/*`)

- `POST /api/homelog/households` — `{ name }`. Rejects if the caller already has a `household_members` row. Creates the household + an `owner` membership in one transaction-like sequence.
- `POST /api/homelog/invites` — `{ inviteeUsername }`. Caller must be a household member. Looks up the username exactly like `app/api/social/requests` does. Rejects: self-invite, inviting someone already in a household, inviting someone with an existing pending invite to this household.
- `GET /api/homelog/invites` — pending invites where I'm the invitee.
- `POST /api/homelog/invites/[id]/accept` — rejects if I already have a household; otherwise creates my `member` row and marks the invite `accepted`.
- `POST /api/homelog/invites/[id]/decline` — marks the invite `declined`.
- `POST /api/homelog/households/[id]/leave` — removes my membership row.
  - If I'm not the owner: simple removal.
  - If I'm the owner and other members remain: ownership transfers to whichever remaining member has the earliest `joinedAt`.
  - If I'm the only member: the household row is deleted (cascades to members/invites via `onDelete: Cascade`).
- `DELETE /api/homelog/households/[id]/members/[profileId]` — owner-only; removes the target member's row. Owner cannot remove themselves this way (must use leave).

### Home page (`/homelog`) — the only page in this sub-project

Client component, decides its view by whether a `household_members` row exists for my profile:

- **No household (onboarding state):**
  - "Create a household" card: name input + submit → `POST /api/homelog/households`.
  - "Pending invites" list (from `GET /api/homelog/invites`): each shows the household name and inviter, with Accept/Decline buttons.
- **In a household:**
  - Household name as the page header.
  - Member list: each row shows name + a role badge (`Owner`/`Member`).
  - "Invite by username" form (available to owner and members) → `POST /api/homelog/invites`, with inline success/error (mirrors `AddFinancialGoalForm`'s error-state pattern).
  - "Leave household" button with a confirm step (destructive action — matches the app's existing confirm-before-destroy convention).
  - If I'm the owner: each non-owner member row also gets a "Remove" action.

## Error handling

- All API routes return `{ error: string }` with an appropriate status code on failure (401 unauthenticated, 400 validation, 404 not found, 409 conflict for "already in a household"/"duplicate invite") — matches the existing `app/api/social/*` error shape.
- The home page surfaces these errors inline near the relevant form, never as a silent failure.

## Testing

Manual, using two real test accounts (already possible via the existing signup flow):
1. Account A creates a household, confirms it appears with A as Owner.
2. Account A invites Account B by username; confirm Account B sees the pending invite on `/homelog` and Account A cannot invite B again (duplicate-pending rejected).
3. Account B accepts; confirm both accounts now see the same household/member list.
4. Account B attempts to create a second household or accept another invite; confirm both are rejected (already in a household).
5. Account A (owner) removes Account B; confirm B is removed and can create/join elsewhere.
6. Re-add B, then have A (owner) leave; confirm ownership transfers to B automatically.
7. B leaves as the last member; confirm the household row (and any leftover invites) are gone.
8. Switch into HomeLog from the AppSwitcher; confirm the terracotta theme applies and clears correctly when switching to BurnLog/LifeLog/TaskLog and back.

## Rollout / ordering

1. Prisma models + RLS.
2. Shell extension (`appMode`, layout, mark, bottom nav, profile menu, AppSwitcher/TopBar/SplashScreen wiring, theme CSS).
3. API routes (households, invites, accept/decline, leave, remove-member).
4. `/homelog` home page (both states).
5. Manual two-account verification per Testing section above.
