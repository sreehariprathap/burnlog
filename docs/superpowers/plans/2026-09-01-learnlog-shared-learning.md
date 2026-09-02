# LearnLog Shared Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One generic sharing mechanism (`LearnGroup`/`LearnGroupMember`/`LearnGroupInvite`) that lets a Skill, Library item, or Career goal be shared — owner invites by username, push-notified accept/decline, and each accepted member gets their own fresh entity row (a real leaderboard, not one merged item).

**Architecture:** Same invite/accept/decline/push shape as items 1-3 in this roadmap (HomeLog, SocialLog, TravelLog), generalized: `LearnGroup` has no direct entity FK (Prisma can't relation-type a column that points at three different tables), so lookups go through `LearnGroupMember.entityId` (a plain UUID column, no DB-level FK, resolved by application code per `entityType`). A single reusable `ShareGroupPanel` component renders the leaderboard + invite form; it's embedded inline on the Skill detail page and inside a `Dialog` for Library/Career (neither has a detail-page route today).

**Tech Stack:** Next.js App Router, Supabase JS client, `lib/pushNotification/server.ts`, `components/ui/dialog.tsx` (existing, unused until now).

**Spec:** `docs/superpowers/specs/2026-09-01-learnlog-shared-learning-design.md`

## Global Constraints

- `entityId` on `LearnGroupMember` has no Prisma relation/FK — it's a plain `String @db.Uuid` resolved by `entityType` in application code. Never add a Prisma relation for it (would require a union type Prisma doesn't support).
- Every route checks the caller is a group member (view) or the group's `owner` member (invite) — matches the pattern already used three times this session.
- All push sends are best-effort: try/catch, logged, never block the primary action.
- No automated tests — verify manually via `npm run dev` + `npx tsc --noEmit` + `npm run build` after each task.
- Sharing is Skills, Library, Career goals only — not Career roles/certs, not Reflections (per spec's non-goals).
- Accepting always creates a **fresh** entity row for the invitee (blank progress) — never links an existing one.

---

## File Structure

```
prisma/schema.prisma                                              — modify: LearnGroup, LearnGroupMember, LearnGroupInvite, Profile relations
lib/notificationTemplates.ts                                      — modify: 3 new learnlog-group templates
app/api/learnlog/groups/route.ts                                  — new: POST get-or-create group for an entity
app/api/learnlog/groups/mine/route.ts                              — new: GET my group membership for a given entityId
app/api/learnlog/groups/[id]/route.ts                              — new: GET group detail (members + resolved entity rows)
app/api/learnlog/groups/[id]/invites/route.ts                      — new: POST create invite (owner-only)
app/api/learnlog/invites/route.ts                                  — new: GET my pending incoming group invites
app/api/learnlog/invites/[id]/accept/route.ts                      — new: POST accept (creates fresh entity + membership)
app/api/learnlog/invites/[id]/decline/route.ts                     — new: POST decline
components/learnlog/ShareGroupPanel.tsx                            — new: reusable leaderboard + invite UI
app/(learnlog)/learnlog/skills/[id]/page.tsx                       — modify: embed ShareGroupPanel
app/(learnlog)/learnlog/library/page.tsx                           — modify: "Share" button + Dialog per card
app/(learnlog)/learnlog/career/page.tsx                            — modify: "Share" button + Dialog on goal cards
app/(learnlog)/learnlog/page.tsx or a banner component              — new: pending group-invites banner (placed on LearnLog Home)
app/(learnlog)/README.md                                           — modify: document shared learning
```

---

### Task 1: Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces tables: `learnlog_groups`, `learnlog_group_members`, `learnlog_group_invites`. Consumed by every route in Tasks 2-4.

- [ ] **Step 1: Add the three models**

Insert near the other LearnLog models in `prisma/schema.prisma`:

```prisma
model LearnGroup {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  entityType String   // 'skill' | 'library_item' | 'career_goal'
  name       String
  createdAt  DateTime @default(now())
  members    LearnGroupMember[]
  invites    LearnGroupInvite[]

  @@map("learnlog_groups")
}

model LearnGroupMember {
  id        String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  group     LearnGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId   String     @db.Uuid
  profile   Profile    @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String     @db.Uuid
  entityId  String     @db.Uuid
  role      String     @default("member") // 'owner' | 'member'
  joinedAt  DateTime   @default(now())

  @@unique([groupId, profileId])
  @@map("learnlog_group_members")
}

model LearnGroupInvite {
  id          String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  group       LearnGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId     String     @db.Uuid
  invitedBy   Profile    @relation("LearnGroupInviteSender", fields: [invitedById], references: [id])
  invitedById String     @db.Uuid
  invitee     Profile    @relation("LearnGroupInviteRecipient", fields: [inviteeId], references: [id])
  inviteeId   String     @db.Uuid
  status      String     @default("pending") // 'pending' | 'accepted' | 'declined'
  createdAt   DateTime   @default(now())
  respondedAt DateTime?

  @@map("learnlog_group_invites")
}
```

- [ ] **Step 2: Add reciprocal relations to `Profile`**

Next to the other LearnLog relations in `model Profile`, add:

```prisma
  LearnGroupMember           LearnGroupMember[]
  learnGroupInvitesSent      LearnGroupInvite[] @relation("LearnGroupInviteSender")
  learnGroupInvitesReceived  LearnGroupInvite[] @relation("LearnGroupInviteRecipient")
```

- [ ] **Step 3: Push schema and generate client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema." If Prisma complains about a missing opposite relation (it did for TravelLog's `TravelVisit.plan` — same class of error can recur here since `LearnGroupMember` has no back-relation issue this time, but verify), fix inline before proceeding.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(learnlog): schema for shared learning groups"
```

---

### Task 2: Group create/lookup/detail API routes

**Files:**
- Create: `app/api/learnlog/groups/route.ts`
- Create: `app/api/learnlog/groups/mine/route.ts`
- Create: `app/api/learnlog/groups/[id]/route.ts`

**Interfaces:**
- Produces: `POST /api/learnlog/groups` → `{ group: { id, entityType, name } }`; `GET /api/learnlog/groups/mine?entityId=X` → `{ group: {...} | null }`; `GET /api/learnlog/groups/[id]` → `{ group, myRole, members: [{ role, profile, entity }] }`. Consumed by `ShareGroupPanel.tsx` (Task 4).

- [ ] **Step 1: Create the get-or-create route**

```ts
// app/api/learnlog/groups/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { entityType, entityId, name } = (await request.json()) as {
      entityType?: string;
      entityId?: string;
      name?: string;
    };
    if (!entityType || !entityId || !name) {
      return NextResponse.json({ error: 'entityType, entityId, and name are required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: existingMembership } = await admin
      .from('learnlog_group_members')
      .select('groupId')
      .eq('profileId', me.id)
      .eq('entityId', entityId)
      .maybeSingle();
    if (existingMembership) {
      const { data: group } = await admin.from('learnlog_groups').select('*').eq('id', existingMembership.groupId).single();
      return NextResponse.json({ group });
    }

    const { data: group, error: groupError } = await admin
      .from('learnlog_groups')
      .insert({ entityType, name })
      .select()
      .single();
    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 400 });
    }

    const { error: memberError } = await admin
      .from('learnlog_group_members')
      .insert({ groupId: group.id, profileId: me.id, entityId, role: 'owner' });
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('create learn group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the "mine" lookup route**

```ts
// app/api/learnlog/groups/mine/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    if (!entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: membership } = await admin
      .from('learnlog_group_members')
      .select('groupId')
      .eq('profileId', me.id)
      .eq('entityId', entityId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ group: null });
    }

    const { data: group } = await admin.from('learnlog_groups').select('*').eq('id', membership.groupId).single();
    return NextResponse.json({ group });
  } catch (error) {
    console.error('lookup learn group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the group detail route (resolves each member's own entity row)**

```ts
// app/api/learnlog/groups/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import type { SupabaseClient } from '@supabase/supabase-js';

const ENTITY_TABLE: Record<string, string> = {
  skill: 'learnlog_skills',
  library_item: 'learnlog_library_items',
  career_goal: 'learnlog_career_goals',
};

async function resolveEntities(admin: SupabaseClient, entityType: string, ids: string[]) {
  const table = ENTITY_TABLE[entityType];
  if (!table || ids.length === 0) return new Map();
  const { data } = await admin.from(table).select('*').in('id', ids);
  return new Map((data ?? []).map((row: { id: string }) => [row.id, row]));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
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
      .from('learnlog_group_members')
      .select('role')
      .eq('groupId', groupId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    const { data: group } = await admin.from('learnlog_groups').select('*').eq('id', groupId).maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const { data: memberRows } = await admin
      .from('learnlog_group_members')
      .select('profileId, entityId, role, joinedAt')
      .eq('groupId', groupId);

    const profileIds = (memberRows ?? []).map((m) => m.profileId);
    const entityIds = (memberRows ?? []).map((m) => m.entityId);
    const [{ data: profiles }, entityById] = await Promise.all([
      admin.from('profiles').select('id, username, firstName, avatarUrl').in('id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000']),
      resolveEntities(admin, group.entityType, entityIds),
    ]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const members = (memberRows ?? []).map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      profile: profileById.get(m.profileId) ?? null,
      entity: entityById.get(m.entityId) ?? null,
    }));

    return NextResponse.json({ group, myRole: myMembership.role, members });
  } catch (error) {
    console.error('get learn group detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit`. Expected: no errors.

```bash
git add app/api/learnlog/groups
git commit -m "feat(learnlog): group create/lookup/detail API routes"
```

---

### Task 3: Invite lifecycle API routes

**Files:**
- Create: `app/api/learnlog/groups/[id]/invites/route.ts`
- Create: `app/api/learnlog/invites/route.ts`
- Create: `app/api/learnlog/invites/[id]/accept/route.ts`
- Create: `app/api/learnlog/invites/[id]/decline/route.ts`
- Modify: `lib/notificationTemplates.ts`

**Interfaces:**
- Produces: the four endpoints, consumed by `ShareGroupPanel.tsx` and the pending-invites banner (Task 4).

- [ ] **Step 1: Create the invite route (owner-only)**

```ts
// app/api/learnlog/groups/[id]/invites/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
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
      .from('learnlog_group_members')
      .select('role')
      .eq('groupId', groupId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership || myMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the group owner can invite' }, { status: 403 });
    }

    const { data: group } = await admin.from('learnlog_groups').select('name').eq('id', groupId).maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
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
      .from('learnlog_group_members')
      .select('id')
      .eq('groupId', groupId)
      .eq('profileId', invitee.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json({ error: 'That user is already in this group' }, { status: 409 });
    }

    const { data: existingInvite } = await admin
      .from('learnlog_group_invites')
      .select('id')
      .eq('groupId', groupId)
      .eq('inviteeId', invitee.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json({ error: 'A pending invite already exists for that user' }, { status: 409 });
    }

    const { data: invite, error: insertError } = await admin
      .from('learnlog_group_invites')
      .insert([{ groupId, invitedById: me.id, inviteeId: invitee.id }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    try {
      const inviterName = me.firstName || me.username;
      await sendPushToUser(admin, invitee.userId, {
        title: 'New learning group invite',
        message: `${inviterName} invited you to join "${group.name}".`,
        url: '/learnlog',
      });
    } catch (pushError) {
      console.error('learn group invite push error:', pushError);
    }

    return NextResponse.json({ invite });
  } catch (error) {
    console.error('create learn group invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the "my pending invites" list route**

```ts
// app/api/learnlog/invites/route.ts
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
      .from('learnlog_group_invites')
      .select('id, groupId, invitedById, createdAt')
      .eq('inviteeId', me.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (!invites || invites.length === 0) {
      return NextResponse.json({ invites: [] });
    }

    const groupIds = [...new Set(invites.map((i) => i.groupId))];
    const inviterIds = [...new Set(invites.map((i) => i.invitedById))];

    const [{ data: groups }, { data: inviters }] = await Promise.all([
      admin.from('learnlog_groups').select('id, name, entityType').in('id', groupIds),
      admin.from('profiles').select('id, username, firstName').in('id', inviterIds),
    ]);

    const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
    const inviterById = new Map((inviters ?? []).map((p) => [p.id, p]));

    const enriched = invites.map((invite) => ({
      id: invite.id,
      groupId: invite.groupId,
      groupName: groupById.get(invite.groupId)?.name ?? 'Unknown',
      entityType: groupById.get(invite.groupId)?.entityType ?? 'skill',
      invitedByUsername: inviterById.get(invite.invitedById)?.username ?? 'someone',
      createdAt: invite.createdAt,
    }));

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('list learn group invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the accept route (creates a fresh entity row per entityType)**

```ts
// app/api/learnlog/invites/[id]/accept/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createFreshEntity(admin: SupabaseClient, entityType: string, profileId: string, name: string): Promise<string> {
  if (entityType === 'skill') {
    const { data, error } = await admin.from('learnlog_skills').insert({ profileId, name }).select('id').single();
    if (error) throw error;
    return data.id;
  }
  if (entityType === 'library_item') {
    const { data, error } = await admin
      .from('learnlog_library_items')
      .insert({ profileId, title: name, type: 'BOOK', status: 'WANT' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
  if (entityType === 'career_goal') {
    const { data, error } = await admin
      .from('learnlog_career_goals')
      .insert({ profileId, title: name, status: 'active' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
  throw new Error(`Unknown entityType: ${entityType}`);
}

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
      .from('learnlog_group_invites')
      .select('id, groupId, invitedById, inviteeId, status')
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

    const { data: group } = await admin.from('learnlog_groups').select('entityType, name').eq('id', invite.groupId).maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const entityId = await createFreshEntity(admin, group.entityType, me.id, group.name);

    const { error: insertMemberError } = await admin
      .from('learnlog_group_members')
      .upsert({ groupId: invite.groupId, profileId: me.id, entityId, role: 'member' }, { onConflict: 'groupId,profileId' });
    if (insertMemberError) {
      return NextResponse.json({ error: insertMemberError.message }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('learnlog_group_invites')
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
          title: 'Group invite accepted',
          message: `${accepterName} joined "${group.name}".`,
          url: '/learnlog',
        });
      }
    } catch (pushError) {
      console.error('learn group invite-accepted push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('accept learn group invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create the decline route**

```ts
// app/api/learnlog/invites/[id]/decline/route.ts
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
      .from('learnlog_group_invites')
      .select('id, groupId, invitedById, inviteeId, status')
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

    const { data: group } = await admin.from('learnlog_groups').select('name').eq('id', invite.groupId).maybeSingle();

    const { error: updateError } = await admin
      .from('learnlog_group_invites')
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
          title: 'Group invite declined',
          message: `${declinerName} declined your invite to "${group?.name ?? 'your group'}".`,
          url: '/learnlog',
        });
      }
    } catch (pushError) {
      console.error('learn group invite-declined push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('decline learn group invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Add matching entries to the admin notification catalog**

In `lib/notificationTemplates.ts`, next to the existing `learnlog-*` entries, add:

```ts
  { id: 'learnlog-group-invite', app: 'learnlog', label: 'New learning group invite', title: 'New learning group invite', message: 'Sam invited you to join "Skiing".', url: '/learnlog' },
  { id: 'learnlog-group-invite-accepted', app: 'learnlog', label: 'Group invite accepted', title: 'Group invite accepted', message: 'Jordan joined "Skiing".', url: '/learnlog' },
  { id: 'learnlog-group-invite-declined', app: 'learnlog', label: 'Group invite declined', title: 'Group invite declined', message: 'Jordan declined your invite to "Skiing".', url: '/learnlog' },
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit`. Expected: no errors.

```bash
git add app/api/learnlog/groups/[id]/invites app/api/learnlog/invites lib/notificationTemplates.ts
git commit -m "feat(learnlog): group invite create/list/accept/decline API routes"
```

---

### Task 4: ShareGroupPanel + wiring into Skills/Library/Career + pending-invites banner

**Files:**
- Create: `components/learnlog/ShareGroupPanel.tsx`
- Modify: `app/(learnlog)/learnlog/skills/[id]/page.tsx`
- Modify: `app/(learnlog)/learnlog/library/page.tsx`
- Modify: `app/(learnlog)/learnlog/career/page.tsx`
- Create: `components/learnlog/GroupInvitesBanner.tsx`
- Modify: `app/(learnlog)/learnlog/page.tsx`

**Interfaces:**
- Consumes: `POST /api/learnlog/groups`, `GET /api/learnlog/groups/mine`, `GET /api/learnlog/groups/[id]`, `POST /api/learnlog/groups/[id]/invites`, `GET /api/learnlog/invites`, `POST /api/learnlog/invites/[id]/accept|decline` (Tasks 2-3).

- [ ] **Step 1: Create the reusable `ShareGroupPanel`**

```tsx
// components/learnlog/ShareGroupPanel.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

type EntityType = 'skill' | 'library_item' | 'career_goal';

interface GroupMember {
  role: string;
  profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
  entity: Record<string, unknown> | null;
}

function memberStat(entityType: EntityType, entity: Record<string, unknown> | null): string {
  if (!entity) return '';
  if (entityType === 'skill') return `Level ${entity.level} · ${entity.currentStreak ?? 0} day streak`;
  if (entityType === 'library_item') return `${entity.status} · ${entity.progressPercent ?? 0}%`;
  if (entityType === 'career_goal') return `${entity.status}`;
  return '';
}

async function fetchGroupDetail(groupId: string) {
  const res = await apiFetch(`/api/learnlog/groups/${groupId}`);
  if (!res.ok) throw new Error('Failed to load group');
  return res.json();
}

export function ShareGroupPanel({
  entityType,
  entityId,
  entityName,
}: {
  entityType: EntityType;
  entityId: string;
  entityName: string;
}) {
  const { toast } = useToast();
  const { data: mineData, mutate: mutateMine } = useSWR(
    `/api/learnlog/groups/mine?entityId=${entityId}`,
    async (url) => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Failed to load group');
      return res.json();
    }
  );
  const groupId: string | null = mineData?.group?.id ?? null;
  const { data: detail, mutate: mutateDetail } = useSWR(groupId ? `group-${groupId}` : null, () => fetchGroupDetail(groupId!));

  const [username, setUsername] = useState('');
  const [sharing, setSharing] = useState(false);
  const [inviting, setInviting] = useState(false);

  async function handleShare() {
    setSharing(true);
    try {
      const res = await apiFetch('/api/learnlog/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, name: entityName }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to share');
      await mutateMine();
      toast({ description: 'Sharing enabled.' });
    } catch (err) {
      toast({ title: 'Could not enable sharing', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  }

  async function handleInvite() {
    if (!groupId || !username.trim()) return;
    setInviting(true);
    try {
      const res = await apiFetch(`/api/learnlog/groups/${groupId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUsername: username.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to invite');
      toast({ description: `Invite sent to @${username.trim()}` });
      setUsername('');
    } catch (err) {
      toast({ title: 'Could not send invite', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  }

  if (!groupId) {
    return (
      <Card>
        <CardContent className="pt-4">
          <Button variant="outline" className="w-full" onClick={handleShare} disabled={sharing}>
            {sharing ? 'Enabling…' : 'Share with others'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Shared with</p>
        {(detail?.members ?? []).map((m: GroupMember) => (
          <div key={m.profile?.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8">
                {m.profile?.avatarUrl && <AvatarImage src={m.profile.avatarUrl} alt={m.profile.username} />}
                <AvatarFallback>{m.profile?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="text-sm truncate">@{m.profile?.username}</p>
              {m.role === 'owner' && <Badge variant="secondary">Owner</Badge>}
            </div>
            <p className="text-xs text-muted-foreground shrink-0">{memberStat(entityType, m.entity)}</p>
          </div>
        ))}
        {detail?.myRole === 'owner' && (
          <div className="flex gap-2 pt-2 border-t">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <Button onClick={handleInvite} disabled={inviting || !username.trim()}>
              {inviting ? 'Sending…' : 'Invite'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Embed it on the Skill detail page**

In `app/(learnlog)/learnlog/skills/[id]/page.tsx`, add the import:

```tsx
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
```

Add `<ShareGroupPanel entityType="skill" entityId={skill.id} entityName={skill.name} />` right after the `NearbyClassesCard` in the JSX.

- [ ] **Step 3: Add "Share" to Library cards (Dialog)**

In `app/(learnlog)/learnlog/library/page.tsx`, add imports:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShareGroupPanel } from '@/components/learnlog/ShareGroupPanel';
import { Share2 } from 'lucide-react';
```

Add state: `const [shareItem, setShareItem] = useState<LibraryItemRow | null>(null);`

Add a "Share" button next to the existing "Add to TaskLog"/"Log to MoneyLog" buttons:

```tsx
<Button size="sm" variant="outline" onClick={() => setShareItem(item)}><Share2 className="h-3 w-3 mr-1" />Share</Button>
```

After the closing `</div>` of the page content, before `<LearnLogBottomNav />`, add:

```tsx
      <Dialog open={!!shareItem} onOpenChange={(open) => !open && setShareItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{shareItem?.title}</DialogTitle></DialogHeader>
          {shareItem && <ShareGroupPanel entityType="library_item" entityId={shareItem.id} entityName={shareItem.title} />}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 4: Add "Share" to Career goal cards (Dialog)**

Apply the same pattern as Step 3 to `app/(learnlog)/learnlog/career/page.tsx`, but only on the Goals tab's cards (not Roles/Certs), using `entityType="career_goal"` and `CareerGoalRow`.

- [ ] **Step 5: Create the pending group-invites banner**

```tsx
// components/learnlog/GroupInvitesBanner.tsx
'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/apiFetch';

interface GroupInvite {
  id: string;
  groupName: string;
  entityType: string;
  invitedByUsername: string;
}

async function fetchInvites(): Promise<GroupInvite[]> {
  const res = await apiFetch('/api/learnlog/invites');
  if (!res.ok) throw new Error('Failed to load group invites');
  const body = await res.json();
  return body.invites ?? [];
}

export function GroupInvitesBanner() {
  const { data: invites, mutate } = useSWR('learnlog-group-invites', fetchInvites);
  const { toast } = useToast();

  async function respond(id: string, action: 'accept' | 'decline') {
    const res = await apiFetch(`/api/learnlog/invites/${id}/${action}`, { method: 'POST' });
    if (res.ok) {
      await mutate();
      toast({ title: action === 'accept' ? 'Group invite accepted' : 'Group invite declined' });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: 'Could not respond', description: body.error, variant: 'destructive' });
    }
  }

  if (!invites || invites.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-medium">Learning group invites</p>
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-2">
            <p className="text-sm truncate">@{inv.invitedByUsername} invited you to &quot;{inv.groupName}&quot;</p>
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

- [ ] **Step 6: Wire the banner into LearnLog Home**

In `app/(learnlog)/learnlog/page.tsx`, import and render `<GroupInvitesBanner />` right after `<TopBar title="LearnLog" />`'s containing div opens, before the stats grid.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`. On a Skill detail page, click "Share with others", confirm the panel switches to showing yourself as Owner. Invite a second test account's username. Log in as that account, confirm the LearnLog Home shows the pending invite banner, accept it, confirm a new Skill with the same name (Level 1, 0 streak) now appears in that account's own `/learnlog/skills` list, and that the original owner's Skill detail page's share panel now shows both members side-by-side with their own level/streak. Repeat spot-check for a Library item and a Career goal share.

- [ ] **Step 8: Commit**

```bash
git add components/learnlog "app/(learnlog)/learnlog/skills/[id]/page.tsx" "app/(learnlog)/learnlog/library/page.tsx" "app/(learnlog)/learnlog/career/page.tsx" "app/(learnlog)/learnlog/page.tsx"
git commit -m "feat(learnlog): ShareGroupPanel, invite UI on Skills/Library/Career, pending-invites banner"
```

---

### Task 5: README + full verification

**Files:**
- Modify: `app/(learnlog)/README.md`

- [ ] **Step 1: Document the new models/routes**

Add a section to `app/(learnlog)/README.md` covering `LearnGroup`/`LearnGroupMember`/`LearnGroupInvite`, which sections support sharing (Skills, Library, Career goals — not Roles/Certs/Reflections), and the "fresh entity per member" behavior on accept.

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit` (expect clean), then `npm run build` (expect clean compile — the two pre-existing unrelated warnings in `burnlog/goals/page.tsx` and `IdeaBreakdownReviewSheet.tsx` are fine).

Revert any regenerated `public/sw.js` / `public/worker-*.js` before committing (PWA build output, not source): `git checkout -- public/sw.js public/worker-<old-hash>.js && rm -f public/worker-<new-hash>.js`.

- [ ] **Step 3: Commit and this closes the multi-user roadmap**

```bash
git add "app/(learnlog)/README.md"
git commit -m "docs(learnlog): document shared learning groups in app README"
```

Update memory `project_multiuser_roadmap.md`: mark item 4 done — this closes the 4-part roadmap.

## Self-Review Notes

- **Spec coverage:** Schema (Task 1), group create/lookup/detail (Task 2), invite lifecycle incl. fresh-entity-per-type creation (Task 3), UI wiring across all three sections + banner (Task 4), README (Task 5) — every spec section maps to a task.
- **Placeholder scan:** No TBD/TODO; every code block is complete.
- **Type consistency:** `ShareGroupPanel`'s props (`entityType`, `entityId`, `entityName`) match every call site in Task 4 (Skill: `skill.id`/`skill.name`; Library: `shareItem.id`/`shareItem.title`; Career: goal's `id`/`title`). `memberStat()`'s field access (`entity.level`, `entity.currentStreak`, `entity.progressPercent`, `entity.status`) matches the actual column names on `learnlog_skills`/`learnlog_library_items`/`learnlog_career_goals` used throughout this session's earlier LearnLog work. `createFreshEntity`'s three inserts match each table's required columns exactly as defined in the LearnLog foundation build (`type`/`status` defaults for `LibraryItem`, `status` default for `CareerGoal`, bare `name` for `Skill`).
