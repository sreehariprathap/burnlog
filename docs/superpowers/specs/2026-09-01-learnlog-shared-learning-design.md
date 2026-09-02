# LearnLog Shared Learning — Design Spec

## Goal

Add multi-user collaboration to LearnLog's Skills, Library, and Career
sections via one generic, reusable sharing mechanism (`LearnGroup`) rather
than three separate copy-pasted systems. An owner can share a Skill,
Library item, or Career goal; invite others by username; invitees get a
push-notified accept/decline flow (same three-message pattern as items 1-3
in this roadmap); and accepted members each track **their own** progress
against the shared thing, visible to each other as a leaderboard —
not one item merged across users.

This is item 4 of 4 in the multi-user notification roadmap (see memory:
`project_multiuser_roadmap.md`). It closes out the roadmap.

## Non-goals

- Sharing Reflections (rejected in brainstorm — a personal journal doesn't
  fit the leaderboard shape the other three sections share).
- Merging one entity row across users. Each member always has their own
  Skill/LibraryItem/CareerGoal row; `LearnGroup` only ties them together
  for display and invites.
- Removing members or transferring ownership. Matches the same scope
  limit HomeLog/SocialLog/TravelLog invites already have — no admin
  management UI beyond invite.
- Letting an invitee link an *existing* item of theirs instead of getting
  a fresh one. Always auto-creates fresh on accept — simpler, avoids a
  merge-conflict UI, and matches "start the challenge together."
- New detail-page routes for Library items or Career goals. Neither has
  one today; sharing UI uses a `Dialog` (already in
  `components/ui/dialog.tsx`) instead, opened from the existing list
  cards on `/learnlog/library` and `/learnlog/career`.

## Data model

Three new models — one generic layer instead of three parallel ones:

```prisma
model LearnGroup {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  entityType String   // 'skill' | 'library_item' | 'career_goal'
  name       String   // display name, e.g. "Skiing" — copied from the owner's item at share time
                       // (Skill.name, LibraryItem.title, or CareerGoal.title depending on entityType)
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
  entityId  String     @db.Uuid // this member's own Skill/LibraryItem/CareerGoal row id
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

`entityId` is deliberately untyped/unconstrained by a Prisma relation
(it points at one of three different tables depending on `entityType`) —
resolved by application code, same pattern as `LogbookCard['app']`-style
discriminated lookups already used elsewhere in this codebase. No FK
constraint at the DB level for this column.

Add `LearnGroupMember[]`, `learnGroupInvitesSent`, `learnGroupInvitesReceived`
relations to `Profile`.

## Flow

**Share** — a "Share" action appears:
- On the Skill detail page (`/learnlog/skills/[id]`), for the skill's
  owner (the profile that created it — LearnLog's `Skill` has no owner
  concept today since it's single-user; the creating profile is
  implicitly the owner).
- On each card in the Library list (`/learnlog/library`) and Career
  Roles/Certs/Goals tabs (`/learnlog/career`) — opens a `Dialog`.

First share on an item with no existing group: creates a `LearnGroup`
(`entityType`, `name` copied from the item) + the sharer's own
`LearnGroupMember` row (`entityId` = their existing item's id, `role:
'owner'`). Sharing again reuses the existing group.

**Invite** — owner enters a username → `LearnGroupInvite` created, push
sent to invitee ("New [skill/book/goal] group invite").

**Accept** — auto-creates a fresh personal row in the relevant table
(same `name`/`title`, blank progress: level 1/xp 0 for a Skill, status
`WANT` for a LibraryItem, status `active` with no `targetDate` for a
CareerGoal) for the invitee, then a `LearnGroupMember` row linking it.
Push sent to inviter ("X joined your group"). The new item appears in
the invitee's normal Skills/Library/Career list like any item they
created themselves, with a "Shared" badge.

**Decline** — marks declined, pushes "X declined" to inviter. No item
created.

**View** — the Share dialog/section (re-opened from any member's own
item) lists every `LearnGroupMember`, resolves each one's own entity row
by `entityType`+`entityId`, and renders a small leaderboard: level/streak
for skills, status/progress for library items, status/target date for
career goals.

## Notifications

Same three-message pattern as items 1-3, added to
`lib/notificationTemplates.ts`: `learnlog-group-invite`,
`learnlog-group-invite-accepted`, `learnlog-group-invite-declined`.

## Error handling & testing

API routes validate the caller is a group member (view) or the group's
`owner` member (invite) via `LearnGroupMember` lookups — matches the
`getMyHouseholdMembership`-style pattern used for the previous three
items. No automated test suite, consistent with every other sub-app in
this repo — verified manually.
