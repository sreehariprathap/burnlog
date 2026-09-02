# LearnLog Foundation — Design Spec

## Goal

Add LearnLog as the ninth sub-app under LogBook: a place to track
lifelong learning — books/courses, physical/practical skills (skiing,
boxing, climbing), career growth, and personal/spiritual reflections —
plus AI-assisted onboarding, AI-generated local class suggestions, and
integration with three existing apps (TaskLog, MoneyLog, TravelLog) and
the LogBook hub.

This is a single pass covering the full app: shell, all four sections,
onboarding, cross-app integration, and local suggestions. Real
web-search-backed local discovery (Tavily + LangGraph) is explicitly
out of scope — see Non-goals.

## Non-goals (this spec)

- Real web-search-backed local class discovery (Tavily/LangGraph). The
  Skills section's "Find nearby classes" feature uses LLM-generated
  ideas only, clearly labeled as unverified suggestions — same
  disclaimer pattern as TravelLog's Suggestions tab. The seam for
  swapping in real search later is a single function
  (`getLocalClassIdeas`), left commented for where a search-backed
  implementation would plug in.
- Gamification beyond level/XP/streak (badges, leaderboards, social
  sharing of skills/reflections).
- Automated tests — no other sub-app in this repo has a dedicated test
  suite (checked BurnLog, MoneyLog, TravelLog, TaskLog, HomeLog,
  SocialLog, ShoppingLog); LearnLog follows the same convention.
  Verification is manual via the `run` skill.

## App scaffolding

Follows the existing 8-app pattern in this repo exactly:

- New route group `app/(learnlog)/learnlog/` with a client
  `layout.tsx` calling `setAppTheme('learnlog')` on mount (mirrors
  every other app's layout since the theme-isolation refactor).
- `lib/appMode.ts`: add `'learnlog'` to the `AppId` union, `isAppId`,
  and a `learnlog` entry in `APPS` (`home: '/learnlog'`, `themeClass:
  'app-learnlog'`, name "LearnLog", tagline "Track what you're
  learning, becoming, and growing into").
- `app/globals.css`: new `.app-learnlog` / `.app-learnlog.dark` theme
  blocks, following the unified-background convention already in
  place — shared `--background`/`--card`/`--popover`/`--sidebar`
  (`#f9f9f9` light / `#22223b` dark, `#2a2a42` for dark cards), with
  `--primary`/`--secondary`/`--accent`/`--foreground` themed to an
  indigo/violet hue (distinct from all 8 existing app hues) to signal
  "growth/knowledge."
- `components/LearnLogMark.tsx`: lucide icon (`GraduationCap`),
  fixed accent color, following the `ShoppingLogMark`/`TravelLogMark`
  pattern (lucide icon component, not emoji/letterform).
- `components/LearnLogBottomNav.tsx`, modeled on
  `TravelLogBottomNav.tsx`: **Home** (`/learnlog`), **Library**
  (`/learnlog/library`), **Skills** (`/learnlog/skills`), **Career**
  (`/learnlog/career`), **Reflections** (`/learnlog/reflections`),
  **Config** (`/learnlog/config`).
- `app/(learnlog)/README.md` documenting routes/data model, matching
  every other app's README.
- Root `README.md`: add LearnLog to the apps table, directory tree,
  and Features section.
- `RootLayoutClient`/login layout: no changes needed — theme switching
  is per-route-group via `setAppTheme`, already generic across all
  apps.

## Data model

Six new Prisma models, all scoped by `profileId` (same relation shape
as every existing model, e.g. `TravelVisit`):

```prisma
enum LibraryItemType {
  BOOK
  COURSE
}

enum LibraryItemStatus {
  WANT
  IN_PROGRESS
  COMPLETED
}

model LibraryItem {
  id              String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile           @relation(fields: [profileId], references: [id])
  profileId       String            @db.Uuid
  type            LibraryItemType
  title           String
  authorOrProvider String?
  status          LibraryItemStatus @default(WANT)
  progressPercent Int               @default(0)
  currentPosition String?           // freeform: "ch. 5", "module 3"
  notes           String?
  rating          Int?              // 1-5, set on completion
  sourceUrl       String?
  cost            Float?            // for the MoneyLog link
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@map("learnlog_library_items")
}

model Skill {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile       Profile         @relation(fields: [profileId], references: [id])
  profileId     String          @db.Uuid
  name          String
  category      String?         // freeform, e.g. "winter sports"
  level         Int             @default(1)
  xp            Int             @default(0)
  currentStreak Int             @default(0)
  longestStreak Int             @default(0)
  lastSessionDate DateTime?     @db.Date
  createdAt     DateTime        @default(now())

  sessions      SkillSession[]
  milestones    SkillMilestone[]

  @@map("learnlog_skills")
}

model SkillSession {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  skill           Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  skillId         String   @db.Uuid
  date            DateTime @db.Date
  durationMinutes Int?
  notes           String?
  xpEarned        Int
  createdAt       DateTime @default(now())

  @@map("learnlog_skill_sessions")
}

model SkillMilestone {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  skill      Skill     @relation(fields: [skillId], references: [id], onDelete: Cascade)
  skillId    String    @db.Uuid
  title      String
  achievedAt DateTime? // null = not yet achieved
  createdAt  DateTime  @default(now())

  @@map("learnlog_skill_milestones")
}

model CareerRole {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile   @relation(fields: [profileId], references: [id])
  profileId String    @db.Uuid
  title     String
  company   String
  startDate DateTime  @db.Date
  endDate   DateTime? @db.Date // null = current role
  notes     String?
  createdAt DateTime  @default(now())

  @@map("learnlog_career_roles")
}

model CareerCertification {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile   @relation(fields: [profileId], references: [id])
  profileId String    @db.Uuid
  name      String
  issuer    String?
  earnedAt  DateTime  @db.Date
  expiresAt DateTime? @db.Date
  notes     String?
  createdAt DateTime  @default(now())

  @@map("learnlog_career_certifications")
}

model CareerGoal {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile    Profile   @relation(fields: [profileId], references: [id])
  profileId  String    @db.Uuid
  title      String
  targetDate DateTime? @db.Date
  status     String    @default("active") // active | achieved | abandoned — matches TaskGoal's string-status convention
  notes      String?
  createdAt  DateTime  @default(now())

  @@map("learnlog_career_goals")
}

model Reflection {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id])
  profileId String   @db.Uuid
  title     String
  body      String
  tags      String[] @default([])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("learnlog_reflections")
}
```

- Add the seven reciprocal relations (`LibraryItem[]`, `Skill[]`,
  `CareerRole[]`, `CareerCertification[]`, `CareerGoal[]`,
  `Reflection[]`) on `Profile`.
- `SkillSession`/`SkillMilestone` cascade-delete with their parent
  `Skill`; everything else follows the existing pattern of no cascade
  (profile deletion isn't a modeled flow anywhere in this schema
  today).

### Leveling — reuse, not reimplementation

`lib/leveling.ts` already exists and is fully generic (`computeLevel`,
`xpForCompletion`, `computeStreakUpdate` — plain numbers and ISO date
strings, no BurnLog-specific coupling). `Skill.level`/`xp`/streaks are
computed with the exact same functions BurnLog uses today. No new
leveling code is written; the API route that logs a `SkillSession`
calls `computeStreakUpdate` then `computeLevel`, exactly as BurnLog's
workout-completion route does.

## Sections (UI)

- **Home** (`/learnlog`): overview — active skills with streaks, book/course
  in progress, upcoming career goal, recent reflection.
- **Library** (`/learnlog/library`): status-pipeline list (Want →
  In Progress → Completed), filterable by type (book/course). Item
  detail: progress, notes, rating, source link, "Add to TaskLog" and
  "Log to MoneyLog" actions.
- **Skills** (`/learnlog/skills`): skill list with level/XP/streak
  cards; skill detail shows session log, milestones, "Log a session"
  form, "Find nearby classes" (AI suggestions), "Add to TaskLog"
  (queue a practice session).
- **Career** (`/learnlog/career`): three tabs/sections — role timeline,
  certifications (with expiry flags), goals.
- **Reflections** (`/learnlog/reflections`): chronological journal
  list, title + body + tags, freeform (no prompts/mood tracking).
- **Config** (`/learnlog/config`): city/region field (powers local
  suggestions), AI-suggestions toggle, "Reonboard," export config as
  JSON — matches every other app's config contract.

## Cross-app integration

**TaskLog** — an "Add to TaskLog" action on `Skill` (creates a
practice-session `Task`) and `LibraryItem` (creates a reading/study
`Task`), calling the same task-creation path TravelLog's Plan flow
uses to spawn logistics/day tasks. No schema change to TaskLog.

**MoneyLog** — `LibraryItem.cost` and an optional per-`SkillSession`
cost get a "Log to MoneyLog" action that creates a linked MoneyLog
transaction (same creation call TravelLog/HomeLog use for their
MoneyLog links). AI onboarding and "Find nearby classes" read
MoneyLog's disposable-income signal before suggesting anything paid,
mirroring TravelLog Suggestions' existing budget-awareness.

**LogBook hub** — a `LearnLogSummaryCard` component added to the Today
digest's card grid: longest-active skill + streak, in-progress
book/course, next career goal deadline. Same slot/contract every other
app's summary card fills.

**TravelLog** — read-only query against `TravelVisit` (and any
upcoming trip plan) to add destination context to "Find nearby
classes" (e.g. surfacing skiing suggestions when a Whistler trip is
logged). From a `Skill` detail page, a "Related trips" chip appears
when a trip's `country`/`placeName` matches the skill's `category`.
No schema changes to TravelLog.

## AI onboarding

Light, conversational flow (OpenRouter, same provider as BurnLog/
MoneyLog onboarding): asks about current interests/skills, reading
goals, and career focus. On completion, seeds 2-3 `Skill` rows, one
`CareerGoal`, and a couple of `LibraryItem` rows (status `WANT`).
Relaunchable as "Reonboard" from Config, same convention as BurnLog/
MoneyLog.

## Local class suggestions ("Find nearby classes")

On a `Skill` detail page: a `getLocalClassIdeas(skill, city, budget)`
function sends an LLM prompt (OpenRouter) combining the skill name,
the user's configured city/region, and MoneyLog disposable income (if
available), and returns 3-5 plausible class/course ideas with a short
"why this fits" line. Results render with a persistent "AI-generated
ideas, not verified listings" disclaimer — same treatment as
TravelLog's Suggestions tab. The function is the explicit seam for a
future Tavily/LangGraph-backed real-search implementation (left as a
one-line comment, no scaffolding built now).

## Error handling & testing

- Standard `ErrorBoundary` (already global) covers the route group.
- API routes validate `profileId` ownership on every LearnLog model,
  identical to the existing pattern (e.g. `TravelVisit` routes).
- No automated test suite, consistent with every other sub-app in this
  repo. Verified manually via the `run` skill once built.
