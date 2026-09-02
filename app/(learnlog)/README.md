# LearnLog

Tracks lifelong learning across four sections:

- **Library** (`/learnlog/library`) — books & courses, status pipeline
  (Want → In Progress → Completed), progress, notes, rating, source link.
- **Skills** (`/learnlog/skills`) — practical/physical skills (skiing,
  boxing, climbing, etc.) with BurnLog-style level/XP/streak tracking
  (reuses `lib/leveling.ts`), session logging, milestones, and
  AI-generated "nearby classes" suggestions.
- **Career** (`/learnlog/career`) — role timeline, certifications, goals.
- **Reflections** (`/learnlog/reflections`) — freeform journal.

## Shared learning

Skills, Library items, and Career goals can be shared with other users
(Career roles/certs and Reflections cannot — a personal journal doesn't
fit the leaderboard shape the other three have). One generic mechanism
covers all three entity types rather than three separate systems:

- `LearnGroup` (`entityType`, `name`) — created lazily the first time
  something is shared.
- `LearnGroupMember` — ties a profile to **their own** entity row
  (`entityId`, untyped — resolved by `entityType` in application code,
  no DB-level FK since it points at three different tables) within a
  group. This is the key design point: sharing a skill does not merge
  one row across users — each member gets their own Skill/LibraryItem/
  CareerGoal, and the group just displays them side-by-side as a
  leaderboard (level/streak for skills, status/progress for library
  items, status for goals).
- `LearnGroupInvite` — pending/accepted/declined, same shape as every
  other invite system in this app (HomeLog households, SocialLog follow
  requests, TravelLog trips). Accepting auto-creates a fresh personal
  entity row (blank progress) for the invitee.
- UI: `components/learnlog/ShareGroupPanel.tsx` (reusable leaderboard +
  invite form) is embedded directly on the Skill detail page, and inside
  a `Dialog` on Library/Career cards (neither has a detail-page route).
  `components/learnlog/GroupInvitesBanner.tsx` on LearnLog Home shows
  pending incoming invites.

## Data model

`LibraryItem`, `Skill`, `SkillSession`, `SkillMilestone`, `CareerRole`,
`CareerCertification`, `CareerGoal`, `Reflection`, `LearnGroup`,
`LearnGroupMember`, `LearnGroupInvite` — see `prisma/schema.prisma`.
Profile settings: `learnLogCity`, `learnLogAiEnabled`.

## Cross-app integration

- **TaskLog** — "Add to TaskLog" creates a `Task` from a `Skill` or
  `LibraryItem` (`lib/learnlog/crossApp.ts`).
- **MoneyLog** — "Log to MoneyLog" creates a `FinanceTransaction` from a
  costed `LibraryItem`/session (`lib/learnlog/crossApp.ts`).
- **LogBook** — `LearnLogSummaryCard` on the Today digest.
- **TravelLog** — Skill detail reads upcoming `TravelVisit` rows for
  destination-aware suggestions.
