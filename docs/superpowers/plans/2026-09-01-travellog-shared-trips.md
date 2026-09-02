# TravelLog Shared Trips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TravelPlan` a shared/collaborative entity — owner can invite other users by username, invitees get a push-notified accept/reject flow, and accepted members share the trip's itinerary and a trip-scoped visit log, while each member's personal exploration map stays untouched.

**Architecture:** Two new Prisma models (`TravelPlanMember`, `TravelPlanInvite`) shaped like the `HouseholdMember`/`HouseholdInvite` pattern already proven this session, but `@@unique([planId, profileId])` rather than globally unique per profile (a person plans many trips over time). `TravelVisit` gets an optional `tripPlanId` tag. New API routes and UI mirror `app/api/homelog/invites/*` and this session's `app/api/sociallog/follow-requests/*` almost exactly — same auth pattern, same best-effort push pattern.

**Tech Stack:** Next.js App Router, Supabase JS client (no Prisma at runtime — schema/push only), `lib/pushNotification/server.ts` (`sendPushToUser`), existing `ItineraryReview` component (extended to support a read-only mode).

**Spec:** `docs/superpowers/specs/2026-09-01-travellog-shared-trips-design.md`

## Global Constraints

- No new API routes beyond what's listed below — everything else stays as direct Supabase-client calls from client components, matching every other app in this repo.
- Every new table is scoped by membership (`TravelPlanMember`) and every route checks the caller is a member (view) or the plan's `owner` (invite/manage) — matches the `getMyHouseholdMembership`-style pattern already in `lib/homelog/serverAuth.ts`.
- All push sends are best-effort: wrapped in try/catch, logged on failure, never block the primary action's success response — matches items 1 and 2 already shipped this session.
- No automated tests — no other sub-app in this repo has one. Verify manually via `npm run dev` + `npx tsc --noEmit` + `npm run build` after each task.
- `numPeople` on `TravelPlan` is untouched — stays a free-standing headcount, independent of actual `TravelPlanMember` rows.

---

## File Structure

```
prisma/schema.prisma                                                     — modify: 2 new models, TravelVisit.tripPlanId, Profile relations
lib/travellog/acceptPlan.ts                                              — modify: create owner TravelPlanMember, tag initial visit with tripPlanId
lib/notificationTemplates.ts                                             — modify: 3 new travellog templates
app/api/travellog/plans/route.ts                                         — new: GET list my trips
app/api/travellog/plans/[id]/route.ts                                    — new: GET trip detail (itinerary + members + trip-scoped visits)
app/api/travellog/plans/[id]/invites/route.ts                            — new: POST create invite (owner-only)
app/api/travellog/invites/route.ts                                       — new: GET my pending incoming trip invites
app/api/travellog/invites/[id]/accept/route.ts                           — new: POST accept
app/api/travellog/invites/[id]/decline/route.ts                          — new: POST decline
components/TravelLogBottomNav.tsx                                        — modify: add "Trips" tab
app/(travellog)/travellog/plan/_components/ItineraryReview.tsx           — modify: onAccept/onStartOver/accepting become optional (read-only mode)
app/(travellog)/travellog/plan/page.tsx                                  — modify: add pending-trip-invites banner
app/(travellog)/travellog/plan/_components/TripInvitesBanner.tsx         — new: pending invites banner (mirrors FollowRequestsBanner.tsx)
app/(travellog)/travellog/trips/page.tsx                                 — new: "My Trips" list
app/(travellog)/travellog/trips/[id]/page.tsx                            — new: trip detail (itinerary read-only, members, invite form, trip visit log)
app/(travellog)/travellog/trips/[id]/_components/InviteMemberForm.tsx    — new: owner-only username invite form
app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx             — modify: optional "Part of a trip?" select
```

---

### Task 1: Schema — TravelPlanMember, TravelPlanInvite, TravelVisit.tripPlanId

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces tables: `travellog_plan_members`, `travellog_plan_invites`. Produces `TravelVisit.tripPlanId` column. Consumed by every task below via `supabase.from('travellog_plan_members' | 'travellog_plan_invites')` and `.eq('tripPlanId', ...)`.

- [ ] **Step 1: Add the two new models**

Insert after `model TravelPlan { ... }` in `prisma/schema.prisma`:

```prisma
model TravelPlanMember {
  id        String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  plan      TravelPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  planId    String     @db.Uuid
  profile   Profile    @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String     @db.Uuid
  role      String     @default("member") // 'owner' | 'member'
  joinedAt  DateTime   @default(now())

  @@unique([planId, profileId])
  @@map("travellog_plan_members")
}

model TravelPlanInvite {
  id          String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  plan        TravelPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  planId      String     @db.Uuid
  invitedBy   Profile    @relation("TravelPlanInviteSender", fields: [invitedById], references: [id])
  invitedById String     @db.Uuid
  invitee     Profile    @relation("TravelPlanInviteRecipient", fields: [inviteeId], references: [id])
  inviteeId   String     @db.Uuid
  status      String     @default("pending") // 'pending' | 'accepted' | 'declined'
  createdAt   DateTime   @default(now())
  respondedAt DateTime?

  @@map("travellog_plan_invites")
}
```

- [ ] **Step 2: Add `members`/`invites` relations to `TravelPlan`, and `tripPlanId` to `TravelVisit`**

In `model TravelPlan`, add:

```prisma
  members  TravelPlanMember[]
  invites  TravelPlanInvite[]
```

In `model TravelVisit`, add (with the other nullable columns):

```prisma
  tripPlanId    String?     @db.Uuid
  plan          TravelPlan? @relation(fields: [tripPlanId], references: [id])
```

- [ ] **Step 3: Add reciprocal relations to `Profile`**

Next to `TravelPlan TravelPlan[]` in `model Profile`, add:

```prisma
  TravelPlanMember             TravelPlanMember[]
  travelPlanInvitesSent        TravelPlanInvite[] @relation("TravelPlanInviteSender")
  travelPlanInvitesReceived    TravelPlanInvite[] @relation("TravelPlanInviteRecipient")
```

- [ ] **Step 4: Push schema and generate client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(travellog): schema for shared trip membership/invites"
```

---

### Task 2: Membership creation on accept + visit tagging

**Files:**
- Modify: `lib/travellog/acceptPlan.ts`

**Interfaces:**
- Consumes: `plan.id` from the existing `travellog_plans` insert in the same function.
- Produces: an owner `TravelPlanMember` row and a `tripPlanId`-tagged initial `TravelVisit`, both consumed by every trip-detail/list query in later tasks.

- [ ] **Step 1: Insert an owner membership row right after the plan insert**

In `lib/travellog/acceptPlan.ts`, after the existing `if (planError) throw planError;` line, add:

```ts
  const { error: memberError } = await supabase.from('travellog_plan_members').insert({
    planId: plan.id,
    profileId,
    role: 'owner',
  });
  if (memberError) throw memberError;
```

- [ ] **Step 2: Tag the auto-logged visit with the plan's id**

In the same file, find the `travellog_visits` insert (`notes: 'Auto-logged from trip plan'`) and add `tripPlanId: plan.id` to that insert object.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, generate and accept a trip plan via `/travellog/plan`. Confirm no errors, and query the DB (or a later task's list page once built) to see the owner membership row and tagged visit exist.

- [ ] **Step 4: Commit**

```bash
git add lib/travellog/acceptPlan.ts
git commit -m "feat(travellog): auto-create owner membership and tag initial visit on plan accept"
```

---

### Task 3: Invite API routes (create, list mine, accept, decline)

**Files:**
- Create: `app/api/travellog/plans/[id]/invites/route.ts`
- Create: `app/api/travellog/invites/route.ts`
- Create: `app/api/travellog/invites/[id]/accept/route.ts`
- Create: `app/api/travellog/invites/[id]/decline/route.ts`
- Modify: `lib/notificationTemplates.ts`

**Interfaces:**
- Consumes: `sendPushToUser` from `@/lib/pushNotification/server` (existing), `createClient`/`createServiceRoleClient` (existing).
- Produces: the four endpoints below, consumed by `TripInvitesBanner.tsx` and `InviteMemberForm.tsx` in Task 5.

- [ ] **Step 1: Create the invite route (owner-only)**

```ts
// app/api/travellog/plans/[id]/invites/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { inviteeUsername } = (await request.json()) as { inviteeUsername?: string };
    if (!inviteeUsername || !inviteeUsername.trim()) {
      return NextResponse.json({ error: 'inviteeUsername is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: myMembership } = await admin
      .from('travellog_plan_members')
      .select('role')
      .eq('planId', planId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership || myMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the trip owner can invite' }, { status: 403 });
    }

    const { data: plan } = await admin.from('travellog_plans').select('destination').eq('id', planId).maybeSingle();
    if (!plan) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const { data: invitee } = await admin
      .from('profiles')
      .select('id, userId')
      .eq('username', inviteeUsername.trim().toLowerCase())
      .maybeSingle();
    if (!invitee) {
      return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
    }
    if (invitee.id === me.id) {
      return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
    }

    const { data: existingMember } = await admin
      .from('travellog_plan_members')
      .select('id')
      .eq('planId', planId)
      .eq('profileId', invitee.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json({ error: 'That user is already on this trip' }, { status: 409 });
    }

    const { data: existingInvite } = await admin
      .from('travellog_plan_invites')
      .select('id')
      .eq('planId', planId)
      .eq('inviteeId', invitee.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json({ error: 'A pending invite already exists for that user' }, { status: 409 });
    }

    const { data: invite, error: insertError } = await admin
      .from('travellog_plan_invites')
      .insert([{ planId, invitedById: me.id, inviteeId: invitee.id }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    try {
      const inviterName = me.firstName || me.username;
      await sendPushToUser(admin, invitee.userId, {
        title: 'New trip invite',
        message: `${inviterName} invited you to join the trip to ${plan.destination}.`,
        url: '/travellog/plan',
      });
    } catch (pushError) {
      console.error('trip invite push error:', pushError);
    }

    return NextResponse.json({ invite });
  } catch (error) {
    console.error('create trip invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the "my pending invites" list route**

```ts
// app/api/travellog/invites/route.ts
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

    const { data: invites } = await admin
      .from('travellog_plan_invites')
      .select('id, planId, invitedById, createdAt')
      .eq('inviteeId', me.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (!invites || invites.length === 0) {
      return NextResponse.json({ invites: [] });
    }

    const planIds = [...new Set(invites.map((i) => i.planId))];
    const inviterIds = [...new Set(invites.map((i) => i.invitedById))];

    const [{ data: plans }, { data: inviters }] = await Promise.all([
      admin.from('travellog_plans').select('id, destination, startDate, endDate').in('id', planIds),
      admin.from('profiles').select('id, username, firstName').in('id', inviterIds),
    ]);

    const planById = new Map((plans ?? []).map((p) => [p.id, p]));
    const inviterById = new Map((inviters ?? []).map((p) => [p.id, p]));

    const enriched = invites.map((invite) => ({
      id: invite.id,
      planId: invite.planId,
      destination: planById.get(invite.planId)?.destination ?? 'Unknown trip',
      startDate: planById.get(invite.planId)?.startDate ?? null,
      endDate: planById.get(invite.planId)?.endDate ?? null,
      invitedByUsername: inviterById.get(invite.invitedById)?.username ?? 'someone',
      createdAt: invite.createdAt,
    }));

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('list trip invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the accept route**

```ts
// app/api/travellog/invites/[id]/accept/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: invite, error: fetchError } = await admin
      .from('travellog_plan_invites')
      .select('id, planId, invitedById, inviteeId, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.inviteeId !== me.id) {
      return NextResponse.json({ error: 'Not your invite to accept' }, { status: 403 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is no longer pending' }, { status: 400 });
    }

    const { error: insertMemberError } = await admin
      .from('travellog_plan_members')
      .upsert({ planId: invite.planId, profileId: me.id, role: 'member' }, { onConflict: 'planId,profileId' });
    if (insertMemberError) {
      return NextResponse.json({ error: insertMemberError.message }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('travellog_plan_invites')
      .update({ status: 'accepted', respondedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    try {
      const { data: inviter } = await admin.from('profiles').select('userId').eq('id', invite.invitedById).maybeSingle();
      if (inviter) {
        const accepterName = me.firstName || me.username;
        await sendPushToUser(admin, inviter.userId, {
          title: 'Trip invite accepted',
          message: `${accepterName} joined your trip.`,
          url: '/travellog/trips',
        });
      }
    } catch (pushError) {
      console.error('trip invite-accepted push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('accept trip invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create the decline route**

```ts
// app/api/travellog/invites/[id]/decline/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: invite, error: fetchError } = await admin
      .from('travellog_plan_invites')
      .select('id, invitedById, inviteeId, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.inviteeId !== me.id) {
      return NextResponse.json({ error: 'Not your invite to decline' }, { status: 403 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is no longer pending' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('travellog_plan_invites')
      .update({ status: 'declined', respondedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    try {
      const { data: inviter } = await admin.from('profiles').select('userId').eq('id', invite.invitedById).maybeSingle();
      if (inviter) {
        const declinerName = me.firstName || me.username;
        await sendPushToUser(admin, inviter.userId, {
          title: 'Trip invite declined',
          message: `${declinerName} declined your trip invite.`,
          url: '/travellog/trips',
        });
      }
    } catch (pushError) {
      console.error('trip invite-declined push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('decline trip invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Add matching entries to the admin notification catalog**

In `lib/notificationTemplates.ts`, next to the existing `travellog-*` entries, add:

```ts
  { id: 'travellog-trip-invite', app: 'travellog', label: 'New trip invite', title: 'New trip invite', message: 'Sam invited you to join the trip to Kyoto.', url: '/travellog/plan' },
  { id: 'travellog-trip-invite-accepted', app: 'travellog', label: 'Trip invite accepted', title: 'Trip invite accepted', message: 'Jordan joined your trip.', url: '/travellog/trips' },
  { id: 'travellog-trip-invite-declined', app: 'travellog', label: 'Trip invite declined', title: 'Trip invite declined', message: 'Jordan declined your trip invite.', url: '/travellog/trips' },
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit`. Expected: no errors.

```bash
git add app/api/travellog/plans/[id]/invites app/api/travellog/invites lib/notificationTemplates.ts
git commit -m "feat(travellog): trip invite create/list/accept/decline API routes"
```

---

### Task 4: Trip list + detail API routes

**Files:**
- Create: `app/api/travellog/plans/route.ts`
- Create: `app/api/travellog/plans/[id]/route.ts`

**Interfaces:**
- Consumes: `travellog_plan_members`, `travellog_plans`, `travellog_visits` tables (Task 1).
- Produces: `GET /api/travellog/plans` → `{ plans: TripSummary[] }`; `GET /api/travellog/plans/[id]` → `{ plan, members, visits }`, consumed by Task 5's pages.

- [ ] **Step 1: Create the "my trips" list route**

```ts
// app/api/travellog/plans/route.ts
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

    const { data: memberships } = await admin
      .from('travellog_plan_members')
      .select('planId, role')
      .eq('profileId', me.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    const planIds = memberships.map((m) => m.planId);
    const { data: plans } = await admin
      .from('travellog_plans')
      .select('id, destination, startDate, endDate, status')
      .in('id', planIds)
      .order('startDate', { ascending: false });

    const roleByPlanId = new Map(memberships.map((m) => [m.planId, m.role]));
    const enriched = (plans ?? []).map((p) => ({ ...p, myRole: roleByPlanId.get(p.id) ?? 'member' }));

    return NextResponse.json({ plans: enriched });
  } catch (error) {
    console.error('list trips error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the trip detail route**

```ts
// app/api/travellog/plans/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params;
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

    const { data: myMembership } = await admin
      .from('travellog_plan_members')
      .select('role')
      .eq('planId', planId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership) {
      return NextResponse.json({ error: 'Not a member of this trip' }, { status: 403 });
    }

    const { data: plan } = await admin.from('travellog_plans').select('*').eq('id', planId).maybeSingle();
    if (!plan) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const { data: memberRows } = await admin
      .from('travellog_plan_members')
      .select('profileId, role, joinedAt')
      .eq('planId', planId);
    const memberIds = (memberRows ?? []).map((m) => m.profileId);
    const { data: memberProfiles } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);
    const profileById = new Map((memberProfiles ?? []).map((p) => [p.id, p]));
    const members = (memberRows ?? []).map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      profile: profileById.get(m.profileId) ?? null,
    }));

    const { data: visits } = await admin
      .from('travellog_visits')
      .select('id, profileId, placeName, country, lat, lng, arrivalDate, departureDate, notes')
      .eq('tripPlanId', planId)
      .order('arrivalDate', { ascending: true });

    return NextResponse.json({ plan, myRole: myMembership.role, members, visits: visits ?? [] });
  } catch (error) {
    console.error('get trip detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit`. Expected: no errors.

```bash
git add app/api/travellog/plans
git commit -m "feat(travellog): trip list and trip detail API routes"
```

---

### Task 5: Trip list page, trip detail page, invite form, invites banner

**Files:**
- Modify: `components/TravelLogBottomNav.tsx`
- Modify: `app/(travellog)/travellog/plan/_components/ItineraryReview.tsx`
- Create: `app/(travellog)/travellog/trips/page.tsx`
- Create: `app/(travellog)/travellog/trips/[id]/page.tsx`
- Create: `app/(travellog)/travellog/trips/[id]/_components/InviteMemberForm.tsx`
- Create: `app/(travellog)/travellog/plan/_components/TripInvitesBanner.tsx`
- Modify: `app/(travellog)/travellog/plan/page.tsx`

**Interfaces:**
- Consumes: `GET /api/travellog/plans`, `GET /api/travellog/plans/[id]`, `POST /api/travellog/plans/[id]/invites`, `GET /api/travellog/invites`, `POST /api/travellog/invites/[id]/accept|decline` (Tasks 3-4).
- Produces: `/travellog/trips` and `/travellog/trips/[id]` routes.

- [ ] **Step 1: Add a "Trips" tab to the bottom nav**

In `components/TravelLogBottomNav.tsx`, add `Users` to the lucide import and insert a new tab between Map and Plan:

```tsx
import { MapIcon, UsersIcon, SparklesIcon, PiggyBankIcon } from 'lucide-react';
```

```tsx
const tabs = [
  { href: '/travellog', label: 'Home', Icon: null },
  { href: '/travellog/map', label: 'Map', Icon: MapIcon },
  { href: '/travellog/trips', label: 'Trips', Icon: UsersIcon },
  { href: '/travellog/plan', label: 'Plan', Icon: SparklesIcon },
  { href: '/travellog/suggestions', label: 'Suggest', Icon: PiggyBankIcon },
];
```

- [ ] **Step 2: Make `ItineraryReview` support a read-only mode**

In `app/(travellog)/travellog/plan/_components/ItineraryReview.tsx`, change the props type and the button row:

```tsx
type ItineraryReviewProps = {
  req: ItineraryRequest;
  itinerary: Itinerary;
  onAccept?: () => void;
  onStartOver?: () => void;
  accepting?: boolean;
};
```

```tsx
export function ItineraryReview({ req, itinerary, onAccept, onStartOver, accepting = false }: ItineraryReviewProps) {
```

Replace the final button row (`<div className="flex gap-2">...</div>` containing "Start over"/"Accept trip plan") with:

```tsx
      {(onAccept || onStartOver) && (
        <div className="flex gap-2">
          {onStartOver && (
            <Button type="button" variant="outline" onClick={onStartOver} disabled={accepting}>
              Start over
            </Button>
          )}
          {onAccept && (
            <Button type="button" className="flex-1" onClick={onAccept} disabled={accepting}>
              {accepting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Accept trip plan'}
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 3: Create the "My Trips" list page**

```tsx
// app/(travellog)/travellog/trips/page.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/apiFetch';

interface TripSummary {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  myRole: 'owner' | 'member';
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trips');
  return res.json();
}

export default function TravelLogTripsPage() {
  const { data, isLoading } = useSWR<{ plans: TripSummary[] }>('/api/travellog/plans', fetcher);

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="My Trips" />
      <div className="p-4 flex flex-col gap-3">
        {isLoading && (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </>
        )}
        {!isLoading && (data?.plans.length ?? 0) === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No trips yet. Plan one from the Plan tab.
            </CardContent>
          </Card>
        )}
        {(data?.plans ?? []).map((trip) => (
          <Link key={trip.id} href={`/travellog/trips/${trip.id}`}>
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{trip.destination}</p>
                  <p className="text-xs text-muted-foreground">{trip.startDate} – {trip.endDate}</p>
                </div>
                {trip.myRole === 'owner' && <Badge variant="secondary">Owner</Badge>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Create the invite-member form**

```tsx
// app/(travellog)/travellog/trips/[id]/_components/InviteMemberForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

export function InviteMemberForm({ planId, onInvited }: { planId: string; onInvited: () => void }) {
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleInvite() {
    if (!username.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/travellog/plans/${planId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUsername: username.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to send invite');
      toast({ description: `Invite sent to @${username.trim()}` });
      setUsername('');
      onInvited();
    } catch (err) {
      toast({ title: 'Could not send invite', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      <Button onClick={handleInvite} disabled={saving || !username.trim()}>
        {saving ? 'Sending…' : 'Invite'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create the trip detail page**

```tsx
// app/(travellog)/travellog/trips/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ItineraryReview } from '../../plan/_components/ItineraryReview';
import { InviteMemberForm } from './_components/InviteMemberForm';
import { apiFetch } from '@/lib/apiFetch';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';

interface TripMember {
  role: string;
  joinedAt: string;
  profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
}

interface TripVisit {
  id: string;
  profileId: string;
  placeName: string;
  country: string;
  arrivalDate: string;
  departureDate: string | null;
}

interface TripDetail {
  plan: {
    id: string;
    destination: string;
    hotel: string | null;
    startDate: string;
    endDate: string;
    numPeople: number;
    transportMode: string;
    budget: number | null;
    budgetCurrency: string;
    itinerary: Itinerary;
  };
  myRole: 'owner' | 'member';
  members: TripMember[];
  visits: TripVisit[];
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trip');
  return res.json();
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, mutate } = useSWR<TripDetail>(`/api/travellog/plans/${params.id}`, fetcher);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen pb-24 p-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  const req: ItineraryRequest = {
    destination: data.plan.destination,
    hotel: data.plan.hotel ?? '',
    startDate: data.plan.startDate,
    endDate: data.plan.endDate,
    numPeople: data.plan.numPeople,
    transportMode: data.plan.transportMode as ItineraryRequest['transportMode'],
    budget: data.plan.budget,
    budgetCurrency: data.plan.budgetCurrency,
  };

  return (
    <div className="min-h-screen pb-24">
      <TopBar title={data.plan.destination} />
      <div className="p-4 flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Trip members</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.members.map((m) => (
              <div key={m.profile?.id} className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  {m.profile?.avatarUrl && <AvatarImage src={m.profile.avatarUrl} alt={m.profile.username} />}
                  <AvatarFallback>{m.profile?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <p className="text-sm">@{m.profile?.username}</p>
                {m.role === 'owner' && <Badge variant="secondary">Owner</Badge>}
              </div>
            ))}
            {data.myRole === 'owner' && (
              <div className="pt-2 border-t mt-2">
                <InviteMemberForm planId={data.plan.id} onInvited={() => mutate()} />
              </div>
            )}
          </CardContent>
        </Card>

        <ItineraryReview req={req} itinerary={data.plan.itinerary} />

        <Card>
          <CardHeader><CardTitle>Trip visit log</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.visits.length === 0 && <p className="text-sm text-muted-foreground">No visits logged for this trip yet.</p>}
            {data.visits.map((v) => (
              <div key={v.id} className="text-sm">
                <p className="font-medium">{v.placeName}, {v.country}</p>
                <p className="text-xs text-muted-foreground">{v.arrivalDate}{v.departureDate ? ` – ${v.departureDate}` : ''}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 6: Create the pending-invites banner**

```tsx
// app/(travellog)/travellog/plan/_components/TripInvitesBanner.tsx
'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

interface TripInvite {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  invitedByUsername: string;
}

async function fetchInvites(): Promise<TripInvite[]> {
  const res = await apiFetch('/api/travellog/invites');
  if (!res.ok) throw new Error('Failed to load trip invites');
  const body = await res.json();
  return body.invites ?? [];
}

export function TripInvitesBanner() {
  const { data: invites, mutate } = useSWR('travellog-invites', fetchInvites);
  const { toast } = useToast();

  async function respond(id: string, action: 'accept' | 'decline') {
    const res = await apiFetch(`/api/travellog/invites/${id}/${action}`, { method: 'POST' });
    if (res.ok) {
      await mutate();
      toast({ title: action === 'accept' ? 'Trip invite accepted' : 'Trip invite declined' });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: 'Could not respond', description: body.error, variant: 'destructive' });
    }
  }

  if (!invites || invites.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Trip invites</p>
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm truncate">@{inv.invitedByUsername} invited you to {inv.destination}</p>
              <p className="text-xs text-muted-foreground">{inv.startDate} – {inv.endDate}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => respond(inv.id, 'decline')}>Decline</Button>
              <Button size="sm" onClick={() => respond(inv.id, 'accept')}>Accept</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Wire the banner into the Plan tab**

In `app/(travellog)/travellog/plan/page.tsx`, import and render it above the intake form / itinerary review:

```tsx
import { TripInvitesBanner } from './_components/TripInvitesBanner';
```

Inside `PlanPageInner`'s returned JSX, right after `<TopBar title="Plan" />`, add:

```tsx
      <div className="px-4 pt-4">
        <TripInvitesBanner />
      </div>
```

- [ ] **Step 8: Manual verification**

Run: `npm run dev`. Generate and accept a trip plan. Visit `/travellog/trips`, confirm it's listed with an "Owner" badge. Open it, confirm the itinerary renders read-only (no "Accept"/"Start over" buttons), members list shows you, and the invite form is visible (owner). Send an invite to a second test account's username; log in as that account, confirm the Plan tab shows the pending invite banner, accept it, confirm it now appears in that account's `/travellog/trips` list without an "Owner" badge.

- [ ] **Step 9: Commit**

```bash
git add components/TravelLogBottomNav.tsx "app/(travellog)/travellog/plan" "app/(travellog)/travellog/trips"
git commit -m "feat(travellog): trip list/detail pages, invite form, pending-invites banner"
```

---

### Task 6: Optional trip tagging when logging a visit

**Files:**
- Modify: `app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx`

**Interfaces:**
- Consumes: `GET /api/travellog/plans` (Task 4).
- Produces: `tripPlanId` optionally set on the `travellog_visits` insert this drawer already performs.

- [ ] **Step 1: Fetch the caller's trips and add a select**

In `LogVisitDrawer.tsx`, add state and a fetch for the user's trips, and a `tripPlanId` field:

```tsx
// add to imports
import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// add inside the component, alongside other useState calls:
const [tripPlanId, setTripPlanId] = useState<string>('none');
const [trips, setTrips] = useState<{ id: string; destination: string }[]>([]);

useEffect(() => {
  if (!open) return;
  createClient().auth.getSession().then(async () => {
    const res = await fetch('/api/travellog/plans');
    if (res.ok) {
      const body = await res.json();
      setTrips((body.plans ?? []).map((p: { id: string; destination: string }) => ({ id: p.id, destination: p.destination })));
    }
  });
}, [open]);
```

- [ ] **Step 2: Render the select in the form and include it in the insert**

Add before the "Notes" field:

```tsx
          {trips.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="tripPlan">Part of a trip? (optional)</Label>
              <Select value={tripPlanId} onValueChange={setTripPlanId}>
                <SelectTrigger id="tripPlan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not part of a trip</SelectItem>
                  {trips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.destination}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
```

In the `handleSave` function's `supabase.from('travellog_visits').insert({...})` call, add:

```tsx
        tripPlanId: tripPlanId === 'none' ? null : tripPlanId,
```

And reset it in the `reset()` function: `setTripPlanId('none');`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Open the Map tab's log-visit drawer while a member of at least one trip. Confirm the "Part of a trip?" select appears, log a visit tagged to a trip, and confirm it shows up on that trip's detail page visit log (Task 5).

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx"
git commit -m "feat(travellog): optional trip tagging when logging a visit"
```

---

### Task 7: README + full verification

**Files:**
- Modify: `app/(travellog)/README.md`

- [ ] **Step 1: Document the new routes/models**

Add a short section to `app/(travellog)/README.md` covering `TravelPlanMember`/`TravelPlanInvite`, the `/travellog/trips` routes, and the invite flow — matching the style of the existing README.

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit` (expect clean), then `npm run build` (expect a clean compile and static generation with no new errors — the two pre-existing unrelated warnings in `burnlog/goals/page.tsx` and `IdeaBreakdownReviewSheet.tsx` are fine).

Revert any regenerated `public/sw.js` / `public/worker-*.js` build artifacts with `git checkout -- public/sw.js public/worker-<old-hash>.js && rm -f public/worker-<new-hash>.js` before committing — these are PWA build output, not source.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/README.md"
git commit -m "docs(travellog): document shared trips in app README"
```

## Self-Review Notes

- **Spec coverage:** Schema (Task 1), membership-on-accept + visit tagging (Task 2), invite lifecycle API (Task 3), trip list/detail API (Task 4), all UI including bottom nav + read-only itinerary + banner (Task 5), optional visit tagging (Task 6), README (Task 7) — every spec section maps to a task.
- **Placeholder scan:** No TBD/TODO in any step; every code block is complete, copy-pasteable.
- **Type consistency:** `TripSummary`/`TripDetail`/`TripMember`/`TripVisit`/`TripInvite` types defined once per consuming file with matching field names against what the API routes in Tasks 3-4 actually return. `ItineraryReview`'s new optional-props signature (Task 5, Step 2) matches how Task 5 Step 5 calls it (`<ItineraryReview req={req} itinerary={data.plan.itinerary} />`, no accept/startOver handlers) and how the existing `plan/page.tsx` call site continues to pass all three (still valid since they're now optional, not removed).
