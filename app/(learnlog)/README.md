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

## Data model

`LibraryItem`, `Skill`, `SkillSession`, `SkillMilestone`, `CareerRole`,
`CareerCertification`, `CareerGoal`, `Reflection` — see
`prisma/schema.prisma`. Profile settings: `learnLogCity`,
`learnLogAiEnabled`.

## Cross-app integration

- **TaskLog** — "Add to TaskLog" creates a `Task` from a `Skill` or
  `LibraryItem` (`lib/learnlog/crossApp.ts`).
- **MoneyLog** — "Log to MoneyLog" creates a `FinanceTransaction` from a
  costed `LibraryItem`/session (`lib/learnlog/crossApp.ts`).
- **LogBook** — `LearnLogSummaryCard` on the Today digest.
- **TravelLog** — Skill detail reads upcoming `TravelVisit` rows for
  destination-aware suggestions.
