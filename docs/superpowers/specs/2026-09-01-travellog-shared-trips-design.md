# TravelLog Shared Trips — Design Spec

## Goal

Add multi-user collaboration to TravelLog: a `TravelPlan` (a specific
planned trip) becomes a shared entity that its creator can invite other
users to, with push-notified accept/decline, mirroring the pattern this
session already shipped for HomeLog household invites and SocialLog
private-account follow requests. Visits logged while part of a shared trip
are tagged to that trip and visible to all trip members on a new trip
detail page, while each member's personal all-time exploration map is
unaffected.

This is item 3 of 4 in the multi-user notification roadmap (see memory:
`project_multiuser_roadmap.md`).

## Non-goals

- Persistent "travel companions" who merge their entire visit history
  (rejected option — see brainstorm).
- Per-member task assignment. `acceptTravelPlan`'s logistics/day-task
  creation stays exactly as-is: tasks go to the creator's TaskLog only.
- Real-time collaborative editing of the itinerary. Last-write-wins;
  no conflict resolution, no presence indicators.
- Per-field granular permissions. Two roles only: `owner` (the creator)
  and `member` (an accepted invitee).
- Editing itinerary/destination/dates after acceptance. That capability
  doesn't exist for solo trips today either — out of scope here too.

## Data model

Two new Prisma models, shaped like `HouseholdMember`/`HouseholdInvite`
but **not** globally unique per profile — a person plans many trips with
different groups over time, unlike the one-household-per-person model:

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

- Add `members TravelPlanMember[]` and `invites TravelPlanInvite[]` to
  `model TravelPlan`.
- Add the four reciprocal relations to `model Profile`
  (`TravelPlanMember[]`, `TravelPlanInvite[]` sent, `TravelPlanInvite[]`
  received — matching the `HouseholdInvite` two-relation naming
  convention already used there).
- `TravelVisit` gets one new nullable column:
  `tripPlanId String? @db.Uuid` with `plan TravelPlan? @relation(fields:
  [tripPlanId], references: [id])`. A visit with a null `tripPlanId` is
  purely personal (today's behavior, unchanged). A visit with a
  `tripPlanId` set additionally appears on that trip's shared log.

No changes to `TravelPlan`'s existing columns (`numPeople` stays a
free-standing headcount for cost/logistics math — e.g. traveling with a
non-app-using friend — independent of actual `TravelPlanMember` rows).

## Membership creation on accept

`lib/travellog/acceptPlan.ts` (`acceptTravelPlan`) already inserts the
`TravelPlan` row and an initial `TravelVisit` for the destination. Two
changes there:

1. After the plan insert succeeds, insert a `TravelPlanMember` row
   (`planId: plan.id, profileId, role: 'owner'`).
2. Tag the auto-logged initial `TravelVisit` insert with
   `tripPlanId: plan.id`.

## API routes

Mirrors the exact shape of `app/api/homelog/invites/*` (list, create,
accept, decline) and this session's `app/api/sociallog/follow-requests/*`
— same auth pattern (`createClient()` for the session, `createServiceRoleClient()`
for the DB work), same best-effort non-blocking push pattern.

- `GET /api/travellog/plans/[id]/members` — list accepted members of a plan.
- `POST /api/travellog/plans/[id]/invites` — `{ inviteeUsername }`, owner-only
  (403 if the caller isn't the plan's `owner` member). Creates a pending
  `TravelPlanInvite`, pushes "New trip invite" to the invitee.
- `GET /api/travellog/invites` — list *my* pending incoming trip invites
  (for the Plan tab banner), same enrichment shape as
  `app/api/homelog/invites/route.ts`'s `GET` (inviter name, plan destination/dates).
- `POST /api/travellog/invites/[id]/accept` — creates the `TravelPlanMember`
  row (`role: 'member'`), marks the invite accepted, pushes "Trip invite
  accepted" to the inviter.
- `POST /api/travellog/invites/[id]/decline` — marks declined, pushes
  "Trip invite declined" to the inviter.
- `GET /api/travellog/plans` — list plans where the caller is a member
  (owner or accepted), for the new trips list page.
- `GET /api/travellog/plans/[id]` — full plan detail (itinerary, member
  list, visits where `tripPlanId = id`) for the trip detail page. 403 if
  the caller isn't a member.

## UI

- **New page** `app/(travellog)/travellog/trips/page.tsx` — "My Trips"
  list. There is currently no page anywhere that lists past `TravelPlan`
  rows (`plan/page.tsx` redirects straight to the map after accepting) —
  this is a real gap, not just new-feature surface. Add a "Trips" tab to
  `TravelLogBottomNav.tsx` pointing here.
- **New page** `app/(travellog)/travellog/trips/[id]/page.tsx` — trip
  detail: itinerary (reuse `ItineraryReview`'s read-only rendering),
  member list, "Invite" button (owner-only, username input, mirrors
  `HouseholdSetupStep`'s invite form), shared visit log for that trip.
- **Plan tab**: add a pending-trip-invites banner at the top, same
  component shape as `FollowRequestsBanner.tsx` (this session) and the
  household invites section of `app/(homelog)/homelog/page.tsx`.
- **`LogVisitDrawer.tsx`**: add an optional "Part of a trip?" select,
  populated with every trip the caller is a member of (owner or accepted
  member), no date filtering — simplest and always correct, including
  logging a visit after the fact. Selecting one sets `tripPlanId` on the
  inserted visit. Defaults to none (personal visit, today's behavior
  unchanged).

## Notifications

Same three-message pattern as HomeLog invites and SocialLog follow
requests, added to the admin test-notification catalog
(`lib/notificationTemplates.ts`) as `travellog-trip-invite`,
`travellog-trip-invite-accepted`, `travellog-trip-invite-declined`.

## Error handling & testing

Standard `ErrorBoundary` (global, unchanged). API routes validate the
caller is a plan member (view) or the plan's owner (invite/remove) via
`TravelPlanMember` lookups, matching the existing
`getMyHouseholdMembership`-style pattern. No automated test suite,
consistent with every other sub-app in this repo — verified manually.
