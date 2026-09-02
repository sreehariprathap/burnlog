# LearnLog Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LearnLog as the ninth sub-app: Library (books/courses), Skills (leveled practice tracking), Career (roles/certs/goals), and Reflections (freeform journal), with AI onboarding, AI-only local class suggestions, and integration into TaskLog, MoneyLog, LogBook, and TravelLog.

**Architecture:** Follows the existing 8-app pattern exactly — a new `app/(learnlog)/` route group, a theme class registered in `lib/appMode.ts` and `globals.css`, and client components that talk directly to Supabase (`createClient()` from `@/lib/supabase/client`) rather than through Next.js API routes or a Prisma runtime client. Prisma is schema-only in this repo (`npx prisma db push`, no migrations directory) — the actual data layer at runtime is the Supabase JS client, scoped per-row with `.eq('profileId', profile.id)`, exactly like every existing sub-app (verified against TravelLog's map/config/home pages).

**Tech Stack:** Next.js (App Router), Supabase JS client, SWR, Prisma (schema/push only), OpenAI SDK pointed at OpenRouter, shadcn/ui components, lucide-react icons, `lib/leveling.ts` (existing, reused as-is).

**Spec:** `docs/superpowers/specs/2026-09-01-learnlog-foundation-design.md`

## Global Constraints

- No new API routes for plain CRUD — use the Supabase client directly from client components, matching TravelLog/BurnLog convention. API routes are only for the two AI calls (onboarding seed generation, local class suggestions), matching `app/api/ai/travellog/suggestions/route.ts`.
- Every LearnLog table is scoped by `profileId` and every query/mutation must filter or set it explicitly — there is no server-side ownership check beyond this (matches existing convention; do not invent a new one).
- App-specific profile settings (city, AI toggle) are new columns directly on the shared `Profile` model, prefixed `learnLog*`, matching `taskLogCurrentStreak`/`mealPrepDayOfWeek`/`aiEnabled` precedent — not a separate config table.
- No automated tests — no other sub-app in this repo has one. Verify manually via `npm run dev` and the browser after each task.
- Reuse `lib/leveling.ts` (`computeLevel`, `computeStreakUpdate`) for Skills XP/level/streak — do not write new leveling math.
- Reuse `components/AchievementOverlay.tsx` for skill level-up/streak celebration — do not write a new overlay.
- No web-search-backed local class discovery (Tavily/LangGraph) — AI-generated ideas only, clearly disclaimed.

---

## File Structure

```
prisma/schema.prisma                                    — modify: 6 models + enums + Profile columns/relations
lib/learnlog/types.ts                                    — new: row types + isSkillCert-style small helpers
lib/learnlog/suggestions.ts                               — new: prompt builders + response validation (local classes)
lib/learnlog/onboarding.ts                                — new: prompt builders + response validation (onboarding seed)
app/api/ai/learnlog/suggestions/route.ts                  — new: local class suggestions endpoint
app/api/ai/learnlog/onboarding/route.ts                   — new: onboarding seed-generation endpoint
components/LearnLogMark.tsx                                — new: lucide icon mark
components/LearnLogBottomNav.tsx                           — new: bottom nav
components/LearnLogSummaryCard.tsx                         — new: LogBook hub digest card
components/AppSwitcher.tsx                                 — modify: register LearnLogMark
lib/appMode.ts                                              — modify: register 'learnlog' AppId
app/globals.css                                             — modify: .app-learnlog theme blocks
app/(learnlog)/layout.tsx                                   — new: theme-setting layout
app/(learnlog)/README.md                                    — new: routes/data model doc
app/(learnlog)/learnlog/page.tsx                            — new: Home
app/(learnlog)/learnlog/library/page.tsx                    — new: Library list
app/(learnlog)/learnlog/library/_components/LibraryItemDrawer.tsx — new: create/edit drawer
app/(learnlog)/learnlog/skills/page.tsx                     — new: Skills list
app/(learnlog)/learnlog/skills/[id]/page.tsx                — new: Skill detail (sessions, milestones, suggestions)
app/(learnlog)/learnlog/skills/_components/SkillDrawer.tsx  — new: create-skill drawer
app/(learnlog)/learnlog/skills/[id]/_components/LogSessionDrawer.tsx — new: log-session drawer
app/(learnlog)/learnlog/skills/[id]/_components/MilestoneList.tsx — new: milestone add/list
app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx — new: AI suggestions trigger+list
app/(learnlog)/learnlog/career/page.tsx                     — new: Career (roles/certs/goals tabs)
app/(learnlog)/learnlog/career/_components/RoleDrawer.tsx   — new
app/(learnlog)/learnlog/career/_components/CertDrawer.tsx   — new
app/(learnlog)/learnlog/career/_components/GoalDrawer.tsx   — new
app/(learnlog)/learnlog/reflections/page.tsx                — new: Reflections list
app/(learnlog)/learnlog/reflections/_components/ReflectionDrawer.tsx — new
app/(learnlog)/learnlog/config/page.tsx                     — new: Config
app/(learnlog)/learnlog/onboarding/page.tsx                 — new: AI onboarding flow
app/(logbook)/logbook/_components (existing dir)            — modify: wire LearnLogSummaryCard into Today digest
app/(tasklog)/... (Task creation helper)                    — new: lib/learnlog/crossApp.ts (createTaskLogTask, logToMoneyLog)
lib/financeCategories.ts                                    — modify: add 'education' expense category
README.md                                                    — modify: apps table, directory tree, Features section
```

---

### Task 1: Schema — 6 models, Profile columns, enums

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces tables (Supabase/Postgres names, used by every later task via `supabase.from('<name>')`):
  `learnlog_library_items`, `learnlog_skills`, `learnlog_skill_sessions`,
  `learnlog_skill_milestones`, `learnlog_career_roles`,
  `learnlog_career_certifications`, `learnlog_career_goals`,
  `learnlog_reflections`.
- Produces `Profile` columns: `learnLogCity String?`, `learnLogAiEnabled Boolean @default(true)`.

- [ ] **Step 1: Add enums and models to `prisma/schema.prisma`**

Append near the other app-specific models (e.g. after the `TravelPlan`/`TravelVisit` block):

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
  id               String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile          Profile           @relation(fields: [profileId], references: [id])
  profileId        String            @db.Uuid
  type             LibraryItemType
  title            String
  authorOrProvider String?
  status           LibraryItemStatus @default(WANT)
  progressPercent  Int               @default(0)
  currentPosition  String?
  notes            String?
  rating           Int?
  sourceUrl        String?
  cost             Float?
  startedAt        DateTime?
  completedAt      DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  @@map("learnlog_library_items")
}

model Skill {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile          @relation(fields: [profileId], references: [id])
  profileId       String           @db.Uuid
  name            String
  category        String?
  level           Int              @default(1)
  xp              Int              @default(0)
  currentStreak   Int              @default(0)
  longestStreak   Int              @default(0)
  lastSessionDate DateTime?        @db.Date
  createdAt       DateTime         @default(now())

  sessions        SkillSession[]
  milestones      SkillMilestone[]

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
  achievedAt DateTime?
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
  endDate   DateTime? @db.Date
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
  status     String    @default("active")
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

- [ ] **Step 2: Add `Profile` columns and relations**

In `model Profile`, add near the other app-specific columns (e.g. next to `taskLogCurrentStreak`):

```prisma
  learnLogCity      String?
  learnLogAiEnabled Boolean  @default(true)
```

In the relations block at the bottom of `model Profile` (next to `TravelVisit TravelVisit[]`):

```prisma
  LibraryItem            LibraryItem[]
  Skill                  Skill[]
  CareerRole             CareerRole[]
  CareerCertification    CareerCertification[]
  CareerGoal             CareerGoal[]
  Reflection             Reflection[]
```

- [ ] **Step 3: Push schema and generate client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema" and no errors. This creates the 8 tables in the Supabase Postgres database.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(learnlog): add Prisma models for Library, Skills, Career, Reflections"
```

---

### Task 2: App shell — theme, nav, mark, layout, switcher registration

**Files:**
- Modify: `lib/appMode.ts`
- Modify: `app/globals.css`
- Create: `components/LearnLogMark.tsx`
- Create: `components/LearnLogBottomNav.tsx`
- Modify: `components/AppSwitcher.tsx`
- Create: `app/(learnlog)/layout.tsx`
- Create: `app/(learnlog)/README.md`

**Interfaces:**
- Consumes: `setAppTheme(app: AppId)` from `lib/appMode.ts` (existing, from the theme-isolation refactor).
- Produces: `AppId` union includes `'learnlog'`; `APPS.learnlog` entry; `<LearnLogMark size?, className?>`; `<LearnLogBottomNav>`; route `/learnlog/*` themed via `.app-learnlog`.

- [ ] **Step 1: Register the AppId in `lib/appMode.ts`**

Add `'learnlog'` to the `AppId` union (top of file), add a `learnlog` entry to `APPS`, and add it to `isAppId`:

```ts
export type AppId = 'logbook' | 'burnlog' | 'moneylog' | 'tasklog' | 'homelog' | 'sociallog' | 'shoppinglog' | 'travellog' | 'learnlog';
```

```ts
  learnlog: {
    id: 'learnlog',
    name: 'LearnLog',
    tagline: "Track what you're learning, becoming, and growing into",
    home: '/learnlog',
    themeClass: 'app-learnlog',
  },
```

```ts
export function isAppId(val: string | null): val is AppId {
  return (
    val === 'logbook' ||
    val === 'burnlog' ||
    val === 'moneylog' ||
    val === 'tasklog' ||
    val === 'homelog' ||
    val === 'sociallog' ||
    val === 'shoppinglog' ||
    val === 'travellog' ||
    val === 'learnlog'
  );
}
```

- [ ] **Step 2: Add the LearnLog theme to `app/globals.css`**

Add after the `.app-travellog.dark` block (before `@layer base`):

```css
.app-learnlog {
  --background: #f9f9f9;
  --foreground: oklch(0.30 0.08 290);
  --card: #f9f9f9;
  --card-foreground: oklch(0.30 0.08 290);
  --popover: #f9f9f9;
  --popover-foreground: oklch(0.30 0.08 290);
  --primary: oklch(0.50 0.18 290);
  --primary-foreground: #f9f9f9;
  --secondary: oklch(0.45 0.14 290);
  --secondary-foreground: #f9f9f9;
  --muted: oklch(0.92 0.03 290);
  --muted-foreground: oklch(0.45 0.06 290);
  --accent: oklch(0.80 0.09 295);
  --accent-foreground: oklch(0.30 0.08 290);
  --destructive: oklch(0.577 0.245 27.325);
  --success: oklch(0.627 0.170 149.214);
  --success-foreground: #ffffff;
  --warning: oklch(0.666 0.157 58.318);
  --warning-foreground: #ffffff;
  --info: oklch(0.546 0.215 262.881);
  --info-foreground: #ffffff;
  --border: oklch(0.86 0.04 290);
  --input: oklch(0.86 0.04 290);
  --ring: oklch(0.50 0.18 290);
  --chart-1: oklch(0.50 0.18 290);
  --chart-2: oklch(0.45 0.14 290);
  --chart-3: oklch(0.80 0.09 295);
  --chart-4: oklch(0.65 0.12 300);
  --chart-5: oklch(0.45 0.06 290);
  --sidebar: #f9f9f9;
  --sidebar-foreground: oklch(0.30 0.08 290);
  --sidebar-primary: oklch(0.50 0.18 290);
  --sidebar-primary-foreground: #f9f9f9;
  --sidebar-accent: oklch(0.80 0.09 295);
  --sidebar-accent-foreground: oklch(0.30 0.08 290);
  --sidebar-border: oklch(0.86 0.04 290);
  --sidebar-ring: oklch(0.50 0.18 290);
}

.app-learnlog.dark {
  --background: #22223b;
  --foreground: #f9f9f9;
  --card: #2a2a42;
  --card-foreground: #f9f9f9;
  --popover: #2a2a42;
  --popover-foreground: #f9f9f9;
  --primary: oklch(0.68 0.16 290);
  --primary-foreground: oklch(0.18 0.03 290);
  --secondary: oklch(0.50 0.14 290);
  --secondary-foreground: #f9f9f9;
  --muted: oklch(0.30 0.04 290);
  --muted-foreground: oklch(0.75 0.05 290);
  --accent: oklch(0.42 0.10 295);
  --accent-foreground: #f9f9f9;
  --destructive: oklch(0.704 0.191 22.216);
  --success: oklch(0.800 0.182 151.711);
  --success-foreground: oklch(0.2 0.03 150);
  --warning: oklch(0.837 0.164 84.429);
  --warning-foreground: oklch(0.2 0.03 80);
  --info: oklch(0.714 0.143 254.624);
  --info-foreground: oklch(0.2 0.03 255);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 18%);
  --ring: oklch(0.68 0.16 290);
  --chart-1: oklch(0.68 0.16 290);
  --chart-2: oklch(0.50 0.14 290);
  --chart-3: oklch(0.42 0.10 295);
  --chart-4: oklch(0.72 0.12 300);
  --chart-5: oklch(0.75 0.05 290);
  --sidebar: #2a2a42;
  --sidebar-foreground: #f9f9f9;
  --sidebar-primary: oklch(0.68 0.16 290);
  --sidebar-primary-foreground: oklch(0.18 0.03 290);
  --sidebar-accent: oklch(0.42 0.10 295);
  --sidebar-accent-foreground: #f9f9f9;
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.68 0.16 290);
}
```

- [ ] **Step 3: Create `components/LearnLogMark.tsx`**

```tsx
// components/LearnLogMark.tsx
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LearnLogMarkProps {
  size?: number;
  className?: string;
}

export function LearnLogMark({ size = 20, className }: LearnLogMarkProps) {
  return (
    <GraduationCap
      size={size}
      strokeWidth={2.5}
      className={cn('shrink-0', className)}
      style={{ color: '#7C3AED' }}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 4: Create `components/LearnLogBottomNav.tsx`**

```tsx
// components/LearnLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { LibraryIcon, DumbbellIcon, BriefcaseIcon, NotebookPenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LearnLogMark } from '@/components/LearnLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/learnlog', label: 'Home', Icon: null },
  { href: '/learnlog/library', label: 'Library', Icon: LibraryIcon },
  { href: '/learnlog/skills', label: 'Skills', Icon: DumbbellIcon },
  { href: '/learnlog/career', label: 'Career', Icon: BriefcaseIcon },
  { href: '/learnlog/reflections', label: 'Reflect', Icon: NotebookPenIcon },
];

export function LearnLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/learnlog/config' || pathname.startsWith('/learnlog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/learnlog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="learnlog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <LearnLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ConfigMenu href="/learnlog/config" isActive={isConfigActive} navId="learnlog-bottom-nav-active" />
    </nav>
  );
}
```

- [ ] **Step 5: Register in `components/AppSwitcher.tsx`**

Add the import and switch case:

```tsx
import { LearnLogMark } from '@/components/LearnLogMark';
```

```tsx
    case 'learnlog':
      return <LearnLogMark size={size} />;
```
(inserted before the `default:` case in `AppIcon`)

- [ ] **Step 6: Create `app/(learnlog)/layout.tsx`**

```tsx
// app/(learnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function LearnLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('learnlog');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 7: Create `app/(learnlog)/README.md`**

```markdown
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
```

- [ ] **Step 8: Verify shell renders**

Run: `npm run dev`, visit `http://localhost:3000/learnlog` (create the placeholder page in Task 3's Home step first if this 404s — otherwise confirm the route group compiles with no page yet by checking `npm run build` has no type errors from this task's files alone: `npx tsc --noEmit`).
Expected: no TypeScript errors from the new/modified files.

- [ ] **Step 9: Commit**

```bash
git add lib/appMode.ts app/globals.css components/LearnLogMark.tsx components/LearnLogBottomNav.tsx components/AppSwitcher.tsx "app/(learnlog)/layout.tsx" "app/(learnlog)/README.md"
git commit -m "feat(learnlog): app shell — theme, nav, mark, switcher registration"
```

---

### Task 3: Library section

**Files:**
- Create: `components/ui/badge.tsx`
- Create: `lib/learnlog/types.ts`
- Create: `app/(learnlog)/learnlog/library/page.tsx`
- Create: `app/(learnlog)/learnlog/library/_components/LibraryItemDrawer.tsx`

**Interfaces:**
- Consumes: `LearnLogBottomNav` (Task 2), `useCurrentProfile` (existing), `createClient` (existing).
- Produces: `LibraryItemRow` type (consumed by Task 7 Home, Task 11 LogBook card, Task 12/13 cross-app). `<Badge>` component (consumed by Tasks 5, 6, 14 — this codebase has no existing Badge component, verified by search; this is the one new primitive this plan adds to `components/ui/`).

- [ ] **Step 0: Create `components/ui/badge.tsx`**

This codebase has no `Badge` component yet (checked `components/ui/` — confirmed absent). Standard shadcn badge, matching the `cn`-based variant pattern used by every other file in `components/ui/`:

```tsx
// components/ui/badge.tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

Run: `grep -n "class-variance-authority" package.json` to confirm the `cva` dependency is already installed (it is used by other `components/ui/*` files like `button.tsx`) — if this returns nothing, run `npm install class-variance-authority` before proceeding.

- [ ] **Step 1: Create `lib/learnlog/types.ts` with the Library row type**

```ts
// lib/learnlog/types.ts

export type LibraryItemType = 'BOOK' | 'COURSE';
export type LibraryItemStatus = 'WANT' | 'IN_PROGRESS' | 'COMPLETED';

export interface LibraryItemRow {
  id: string;
  profileId: string;
  type: LibraryItemType;
  title: string;
  authorOrProvider: string | null;
  status: LibraryItemStatus;
  progressPercent: number;
  currentPosition: string | null;
  notes: string | null;
  rating: number | null;
  sourceUrl: string | null;
  cost: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillRow {
  id: string;
  profileId: string;
  name: string;
  category: string | null;
  level: number;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string | null;
  createdAt: string;
}

export interface SkillSessionRow {
  id: string;
  skillId: string;
  date: string;
  durationMinutes: number | null;
  notes: string | null;
  xpEarned: number;
  createdAt: string;
}

export interface SkillMilestoneRow {
  id: string;
  skillId: string;
  title: string;
  achievedAt: string | null;
  createdAt: string;
}

export interface CareerRoleRow {
  id: string;
  profileId: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CareerCertificationRow {
  id: string;
  profileId: string;
  name: string;
  issuer: string | null;
  earnedAt: string;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CareerGoalRow {
  id: string;
  profileId: string;
  title: string;
  targetDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface ReflectionRow {
  id: string;
  profileId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create the Library list page**

```tsx
// app/(learnlog)/learnlog/library/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Star } from 'lucide-react';
import type { LibraryItemRow } from '@/lib/learnlog/types';
import { LibraryItemDrawer } from './_components/LibraryItemDrawer';

async function fetchLibraryItems(profileId: string): Promise<LibraryItemRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_library_items')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LibraryItemRow[];
}

const STATUS_LABEL: Record<string, string> = {
  WANT: 'Want to read/take',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export default function LearnLogLibraryPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: items, isLoading, mutate } = useSWR(
    profile ? ['learnlog-library', profile.id] : null,
    () => fetchLibraryItems(profile!.id)
  );

  const loading = isLoading;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Library" />
      <div className="p-4 flex flex-col gap-4">
        <Button onClick={() => setDrawerOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add book or course
        </Button>

        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        )}

        {!loading && (items ?? []).length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              Nothing tracked yet. Add a book or course to get started.
            </CardContent>
          </Card>
        )}

        {(items ?? []).map((item) => (
          <Card key={item.id}>
            <CardContent className="pt-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="font-medium">{item.title}</p>
                <Badge variant="secondary">{item.type === 'BOOK' ? 'Book' : 'Course'}</Badge>
              </div>
              {item.authorOrProvider && (
                <p className="text-xs text-muted-foreground">{item.authorOrProvider}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
                {item.status === 'IN_PROGRESS' && (
                  <span className="text-xs text-muted-foreground">{item.progressPercent}%</span>
                )}
                {item.rating != null && (
                  <span className="flex items-center text-xs text-muted-foreground">
                    <Star className="h-3 w-3 mr-0.5 fill-current" /> {item.rating}/5
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {profile && (
        <LibraryItemDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
      <LearnLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Create the create-item drawer**

```tsx
// app/(learnlog)/learnlog/library/_components/LibraryItemDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import type { LibraryItemType } from '@/lib/learnlog/types';

type LibraryItemDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function LibraryItemDrawer({ profileId, open, onOpenChange, onSaved }: LibraryItemDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [type, setType] = useState<LibraryItemType>('BOOK');
  const [title, setTitle] = useState('');
  const [authorOrProvider, setAuthorOrProvider] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [cost, setCost] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setType('BOOK');
    setTitle('');
    setAuthorOrProvider('');
    setSourceUrl('');
    setCost('');
    setTitleError(null);
  }

  async function handleSave() {
    setTitleError(null);
    if (!title.trim()) {
      setTitleError('Title is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('learnlog_library_items').insert({
        profileId,
        type,
        title: title.trim(),
        authorOrProvider: authorOrProvider.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        cost: cost.trim() ? Number(cost) : null,
        status: 'WANT',
      });
      if (error) throw error;
      toast({ description: `Added ${title.trim()}.` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save item', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add book or course</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LibraryItemType)}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOK">Book</SelectItem>
                <SelectItem value="COURSE">Course</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Atomic Habits" />
            {titleError && <p className="text-red-500 text-xs">{titleError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="authorOrProvider">{type === 'BOOK' ? 'Author' : 'Provider'} (optional)</Label>
            <Input id="authorOrProvider" value={authorOrProvider} onChange={(e) => setAuthorOrProvider(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sourceUrl">Link (optional)</Label>
            <Input id="sourceUrl" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cost">Cost (optional)</Label>
            <Input id="cost" type="number" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in, visit `/learnlog/library`. Add a book, confirm it appears in the list with status "Want to read/take" and the correct type badge.

- [ ] **Step 5: Commit**

```bash
git add components/ui/badge.tsx lib/learnlog/types.ts "app/(learnlog)/learnlog/library"
git commit -m "feat(learnlog): Library section — list, create drawer, Badge primitive"
```

---

### Task 4: Skills section — list, create, session logging with leveling, milestones

**Files:**
- Create: `app/(learnlog)/learnlog/skills/page.tsx`
- Create: `app/(learnlog)/learnlog/skills/_components/SkillDrawer.tsx`
- Create: `app/(learnlog)/learnlog/skills/[id]/page.tsx`
- Create: `app/(learnlog)/learnlog/skills/[id]/_components/LogSessionDrawer.tsx`
- Create: `app/(learnlog)/learnlog/skills/[id]/_components/MilestoneList.tsx`

**Interfaces:**
- Consumes: `SkillRow`, `SkillSessionRow`, `SkillMilestoneRow` (Task 3), `computeLevel`/`computeStreakUpdate` from `lib/leveling.ts` (existing), `AchievementOverlay` (existing).
- Produces: `/learnlog/skills/[id]` route consumed by Task 10 (nearby classes) and Task 14 (TravelLog related-trips chip).

- [ ] **Step 1: Create the Skills list page**

```tsx
// app/(learnlog)/learnlog/skills/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Flame } from 'lucide-react';
import type { SkillRow } from '@/lib/learnlog/types';
import { SkillDrawer } from './_components/SkillDrawer';

async function fetchSkills(profileId: string): Promise<SkillRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_skills')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export default function LearnLogSkillsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: skills, isLoading, mutate } = useSWR(
    profile ? ['learnlog-skills', profile.id] : null,
    () => fetchSkills(profile!.id)
  );

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Skills" />
      <div className="p-4 flex flex-col gap-4">
        <Button onClick={() => setDrawerOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add a skill
        </Button>

        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        )}

        {!isLoading && (skills ?? []).length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No skills yet. Add one — skiing, boxing, climbing, anything you're building.
            </CardContent>
          </Card>
        )}

        {(skills ?? []).map((skill) => (
          <Link key={skill.id} href={`/learnlog/skills/${skill.id}`}>
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{skill.name}</p>
                  <p className="text-xs text-muted-foreground">Level {skill.level} · {skill.xp} XP</p>
                </div>
                {skill.currentStreak > 0 && (
                  <span className="flex items-center text-xs text-muted-foreground">
                    <Flame className="h-3 w-3 mr-0.5" /> {skill.currentStreak}
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {profile && (
        <SkillDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
      <LearnLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Create the skill-creation drawer**

```tsx
// app/(learnlog)/learnlog/skills/_components/SkillDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type SkillDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function SkillDrawer({ profileId, open, onOpenChange, onSaved }: SkillDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName('');
    setCategory('');
    setNameError(null);
  }

  async function handleSave() {
    setNameError(null);
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('learnlog_skills').insert({
        profileId,
        name: name.trim(),
        category: category.trim() || null,
      });
      if (error) throw error;
      toast({ description: `Added ${name.trim()}.` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save skill', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add a skill</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skiing" />
            {nameError && <p className="text-red-500 text-xs">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Category (optional)</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. winter sports" />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 3: Create the milestone list component**

```tsx
// app/(learnlog)/learnlog/skills/[id]/_components/MilestoneList.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import type { SkillMilestoneRow } from '@/lib/learnlog/types';

type MilestoneListProps = {
  skillId: string;
  milestones: SkillMilestoneRow[];
  onChanged: () => void;
};

export function MilestoneList({ skillId, milestones, onChanged }: MilestoneListProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function addMilestone() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('learnlog_skill_milestones').insert({
        skillId,
        title: newTitle.trim(),
      });
      if (error) throw error;
      setNewTitle('');
      onChanged();
    } catch (err) {
      toast({ title: 'Could not add milestone', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAchieved(milestone: SkillMilestoneRow) {
    const { error } = await supabase
      .from('learnlog_skill_milestones')
      .update({ achievedAt: milestone.achievedAt ? null : new Date().toISOString() })
      .eq('id', milestone.id);
    if (error) {
      toast({ title: 'Could not update milestone', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();
  }

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="font-medium text-sm">Milestones</p>
        {milestones.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <Checkbox checked={!!m.achievedAt} onCheckedChange={() => toggleAchieved(m)} />
            <span className={m.achievedAt ? 'line-through text-muted-foreground text-sm' : 'text-sm'}>{m.title}</span>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Parallel turns"
            onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(); }}
          />
          <Button type="button" variant="outline" onClick={addMilestone} disabled={saving || !newTitle.trim()}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the log-session drawer (leveling logic lives here)**

```tsx
// app/(learnlog)/learnlog/skills/[id]/_components/LogSessionDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { AchievementOverlay } from '@/components/AchievementOverlay';
import { computeLevel, computeStreakUpdate } from '@/lib/leveling';
import type { SkillRow } from '@/lib/learnlog/types';

type LogSessionDrawerProps = {
  skill: SkillRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function LogSessionDrawer({ skill, open, onOpenChange, onSaved }: LogSessionDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [achievement, setAchievement] = useState<{ stats: string[]; celebrate: boolean } | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { newStreak, xpGained } = computeStreakUpdate({
        lastSessionDate: skill.lastSessionDate,
        today,
        currentStreak: skill.currentStreak,
      });
      const newXp = skill.xp + xpGained;
      const newLevel = computeLevel(newXp);

      const { error: sessionError } = await supabase.from('learnlog_skill_sessions').insert({
        skillId: skill.id,
        date: today,
        durationMinutes: duration.trim() ? Number(duration) : null,
        notes: notes.trim() || null,
        xpEarned: xpGained,
      });
      if (sessionError) throw sessionError;

      const { error: skillError } = await supabase
        .from('learnlog_skills')
        .update({
          xp: newXp,
          level: newLevel,
          currentStreak: newStreak,
          longestStreak: Math.max(skill.longestStreak, newStreak),
          lastSessionDate: today,
        })
        .eq('id', skill.id);
      if (skillError) throw skillError;

      const leveledUp = newLevel > skill.level;
      const stats = [`+${xpGained} XP`, `${newStreak} day streak`];
      if (newStreak > skill.longestStreak) stats.push('New record!');
      if (leveledUp) stats.push(`Level ${newLevel}!`);

      setDuration('');
      setNotes('');
      onOpenChange(false);
      onSaved();
      setAchievement({ stats, celebrate: leveledUp || (newStreak > 0 && newStreak % 7 === 0) });
    } catch (err) {
      toast({ title: 'Could not log session', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Log a {skill.name} session</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">Duration (minutes, optional)</Label>
              <Input id="duration" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Log session'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
      <AchievementOverlay
        open={!!achievement}
        title="Session logged!"
        stats={achievement?.stats ?? []}
        celebrate={achievement?.celebrate ?? false}
        onClose={() => setAchievement(null)}
        autoCloseMs={2500}
      />
    </>
  );
}
```

- [ ] **Step 5: Create the Skill detail page**

```tsx
// app/(learnlog)/learnlog/skills/[id]/page.tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame } from 'lucide-react';
import type { SkillRow, SkillSessionRow, SkillMilestoneRow } from '@/lib/learnlog/types';
import { LogSessionDrawer } from './_components/LogSessionDrawer';
import { MilestoneList } from './_components/MilestoneList';
import { NearbyClassesCard } from './_components/NearbyClassesCard';

async function fetchSkill(id: string): Promise<SkillRow> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_skills').select('*').eq('id', id).single();
  if (error) throw error;
  return data as SkillRow;
}

async function fetchSessions(skillId: string): Promise<SkillSessionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_skill_sessions')
    .select('*')
    .eq('skillId', skillId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillSessionRow[];
}

async function fetchMilestones(skillId: string): Promise<SkillMilestoneRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_skill_milestones')
    .select('*')
    .eq('skillId', skillId)
    .order('createdAt', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SkillMilestoneRow[];
}

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const skillId = params.id;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: skill, isLoading: skillLoading, mutate: mutateSkill } = useSWR(
    ['learnlog-skill', skillId],
    () => fetchSkill(skillId)
  );
  const { data: sessions, mutate: mutateSessions } = useSWR(
    ['learnlog-skill-sessions', skillId],
    () => fetchSessions(skillId)
  );
  const { data: milestones, mutate: mutateMilestones } = useSWR(
    ['learnlog-skill-milestones', skillId],
    () => fetchMilestones(skillId)
  );

  if (skillLoading || !skill) {
    return (
      <div className="min-h-screen pb-24 p-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title={skill.name} />
      <div className="p-4 flex flex-col gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">Level {skill.level}</p>
              <p className="text-xs text-muted-foreground">{skill.xp} XP</p>
            </div>
            {skill.currentStreak > 0 && (
              <span className="flex items-center text-sm text-muted-foreground">
                <Flame className="h-4 w-4 mr-1" /> {skill.currentStreak} day streak
              </span>
            )}
          </CardContent>
        </Card>

        <Button onClick={() => setDrawerOpen(true)} className="w-full">Log a session</Button>

        <MilestoneList skillId={skill.id} milestones={milestones ?? []} onChanged={() => mutateMilestones()} />

        <NearbyClassesCard skill={skill} />

        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">Recent sessions</p>
          {(sessions ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No sessions logged yet.</p>
          )}
          {(sessions ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-3 pb-3 flex items-center justify-between text-sm">
                <span>{s.date}{s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}</span>
                <span className="text-muted-foreground">+{s.xpEarned} XP</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <LogSessionDrawer
        skill={skill}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSaved={() => { mutateSkill(); mutateSessions(); }}
      />
      <LearnLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 6: Create a placeholder `NearbyClassesCard` (full implementation in Task 10)**

```tsx
// app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { SkillRow } from '@/lib/learnlog/types';

type NearbyClassesCardProps = {
  skill: SkillRow;
};

// Task 10 replaces this body with the AI-suggestions trigger + list.
export function NearbyClassesCard({ skill }: NearbyClassesCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 text-sm text-muted-foreground">
        Nearby classes for {skill.name} — coming up next.
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, visit `/learnlog/skills`, add a skill, open its detail page, log a session. Confirm XP/level/streak update on the skill card and the achievement overlay appears. Log a second session next day (or manually edit `lastSessionDate` in the DB to yesterday) to confirm streak increments rather than resets.

- [ ] **Step 8: Commit**

```bash
git add "app/(learnlog)/learnlog/skills"
git commit -m "feat(learnlog): Skills section — list, detail, session logging with leveling, milestones"
```

---

### Task 5: Career section

**Files:**
- Create: `app/(learnlog)/learnlog/career/page.tsx`
- Create: `app/(learnlog)/learnlog/career/_components/RoleDrawer.tsx`
- Create: `app/(learnlog)/learnlog/career/_components/CertDrawer.tsx`
- Create: `app/(learnlog)/learnlog/career/_components/GoalDrawer.tsx`

**Interfaces:**
- Consumes: `CareerRoleRow`, `CareerCertificationRow`, `CareerGoalRow` (Task 3).
- Produces: nothing consumed elsewhere in this plan (self-contained section).

- [ ] **Step 1: Create `RoleDrawer.tsx`**

```tsx
// app/(learnlog)/learnlog/career/_components/RoleDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type RoleDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function RoleDrawer({ profileId, open, onOpenChange, onSaved }: RoleDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isCurrent, setIsCurrent] = useState(true);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!title.trim() || !company.trim()) {
      setError('Title and company are required');
      return;
    }
    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('learnlog_career_roles').insert({
        profileId,
        title: title.trim(),
        company: company.trim(),
        startDate,
        endDate: isCurrent ? null : (endDate || null),
        notes: notes.trim() || null,
      });
      if (dbError) throw dbError;
      toast({ description: `Added ${title.trim()}.` });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save role', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add a role</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={isCurrent} onCheckedChange={(v) => setIsCurrent(!!v)} id="isCurrent" />
            <Label htmlFor="isCurrent">This is my current role</Label>
          </div>
          {!isCurrent && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Create `CertDrawer.tsx`**

```tsx
// app/(learnlog)/learnlog/career/_components/CertDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type CertDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function CertDrawer({ profileId, open, onOpenChange, onSaved }: CertDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [earnedAt, setEarnedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('learnlog_career_certifications').insert({
        profileId,
        name: name.trim(),
        issuer: issuer.trim() || null,
        earnedAt,
        expiresAt: expiresAt || null,
        notes: notes.trim() || null,
      });
      if (dbError) throw dbError;
      toast({ description: `Added ${name.trim()}.` });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save certification', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add a certification</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="issuer">Issuer (optional)</Label>
            <Input id="issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="earnedAt">Earned</Label>
            <Input id="earnedAt" type="date" value={earnedAt} onChange={(e) => setEarnedAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expiresAt">Expires (optional)</Label>
            <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 3: Create `GoalDrawer.tsx`**

```tsx
// app/(learnlog)/learnlog/career/_components/GoalDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type GoalDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function GoalDrawer({ profileId, open, onOpenChange, onSaved }: GoalDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('learnlog_career_goals').insert({
        profileId,
        title: title.trim(),
        targetDate: targetDate || null,
        notes: notes.trim() || null,
        status: 'active',
      });
      if (dbError) throw dbError;
      toast({ description: `Added ${title.trim()}.` });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save goal', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add a career goal</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Become a Staff Engineer" />
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetDate">Target date (optional)</Label>
            <Input id="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Create the Career page with three tabs**

```tsx
// app/(learnlog)/learnlog/career/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import type { CareerRoleRow, CareerCertificationRow, CareerGoalRow } from '@/lib/learnlog/types';
import { RoleDrawer } from './_components/RoleDrawer';
import { CertDrawer } from './_components/CertDrawer';
import { GoalDrawer } from './_components/GoalDrawer';

async function fetchRoles(profileId: string): Promise<CareerRoleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_roles').select('*').eq('profileId', profileId).order('startDate', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerRoleRow[];
}

async function fetchCerts(profileId: string): Promise<CareerCertificationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_certifications').select('*').eq('profileId', profileId).order('earnedAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerCertificationRow[];
}

async function fetchGoals(profileId: string): Promise<CareerGoalRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_career_goals').select('*').eq('profileId', profileId).order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerGoalRow[];
}

export default function LearnLogCareerPage() {
  const { profile } = useCurrentProfile();
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [certDrawerOpen, setCertDrawerOpen] = useState(false);
  const [goalDrawerOpen, setGoalDrawerOpen] = useState(false);

  const { data: roles, mutate: mutateRoles } = useSWR(profile ? ['learnlog-roles', profile.id] : null, () => fetchRoles(profile!.id));
  const { data: certs, mutate: mutateCerts } = useSWR(profile ? ['learnlog-certs', profile.id] : null, () => fetchCerts(profile!.id));
  const { data: goals, mutate: mutateGoals } = useSWR(profile ? ['learnlog-goals', profile.id] : null, () => fetchGoals(profile!.id));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Career" />
      <div className="p-4">
        <Tabs defaultValue="roles">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="certs">Certs</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="flex flex-col gap-3 mt-4">
            <Button onClick={() => setRoleDrawerOpen(true)} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add role</Button>
            {(roles ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center">No roles logged yet.</p>}
            {(roles ?? []).map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{r.title}</p>
                    {!r.endDate && <Badge>Current</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{r.company} · {r.startDate}{r.endDate ? ` – ${r.endDate}` : ' – present'}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="certs" className="flex flex-col gap-3 mt-4">
            <Button onClick={() => setCertDrawerOpen(true)} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add certification</Button>
            {(certs ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center">No certifications logged yet.</p>}
            {(certs ?? []).map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{c.name}</p>
                    {c.expiresAt && c.expiresAt < today && <Badge variant="destructive">Expired</Badge>}
                  </div>
                  {c.issuer && <p className="text-xs text-muted-foreground">{c.issuer}</p>}
                  <p className="text-xs text-muted-foreground">Earned {c.earnedAt}{c.expiresAt ? ` · expires ${c.expiresAt}` : ''}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="goals" className="flex flex-col gap-3 mt-4">
            <Button onClick={() => setGoalDrawerOpen(true)} className="w-full"><Plus className="h-4 w-4 mr-2" /> Add goal</Button>
            {(goals ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center">No career goals yet.</p>}
            {(goals ?? []).map((g) => (
              <Card key={g.id}>
                <CardContent className="pt-4">
                  <p className="font-medium">{g.title}</p>
                  {g.targetDate && <p className="text-xs text-muted-foreground">Target: {g.targetDate}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {profile && (
        <>
          <RoleDrawer profileId={profile.id} open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen} onSaved={() => mutateRoles()} />
          <CertDrawer profileId={profile.id} open={certDrawerOpen} onOpenChange={setCertDrawerOpen} onSaved={() => mutateCerts()} />
          <GoalDrawer profileId={profile.id} open={goalDrawerOpen} onOpenChange={setGoalDrawerOpen} onSaved={() => mutateGoals()} />
        </>
      )}
      <LearnLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, visit `/learnlog/career`. Add a role, a cert with a past `expiresAt`, and a goal. Confirm the role shows "Current" badge when no end date, the cert shows "Expired" badge, and all three tabs list their items.

- [ ] **Step 6: Commit**

```bash
git add "app/(learnlog)/learnlog/career"
git commit -m "feat(learnlog): Career section — roles, certifications, goals"
```

---

### Task 6: Reflections section

**Files:**
- Create: `app/(learnlog)/learnlog/reflections/page.tsx`
- Create: `app/(learnlog)/learnlog/reflections/_components/ReflectionDrawer.tsx`

**Interfaces:**
- Consumes: `ReflectionRow` (Task 3).

- [ ] **Step 1: Create `ReflectionDrawer.tsx`**

```tsx
// app/(learnlog)/learnlog/reflections/_components/ReflectionDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';

type ReflectionDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function ReflectionDrawer({ profileId, open, onOpenChange, onSaved }: ReflectionDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      const { error: dbError } = await supabase.from('learnlog_reflections').insert({
        profileId,
        title: title.trim(),
        body: body.trim(),
        tags,
      });
      if (dbError) throw dbError;
      toast({ description: 'Reflection saved.' });
      setTitle('');
      setBody('');
      setTagsInput('');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save reflection', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>New reflection</DrawerTitle></DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="body">Entry</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tags">Tags (comma-separated, optional)</Label>
            <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="gratitude, meditation" />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Create the Reflections list page**

```tsx
// app/(learnlog)/learnlog/reflections/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import type { ReflectionRow } from '@/lib/learnlog/types';
import { ReflectionDrawer } from './_components/ReflectionDrawer';

async function fetchReflections(profileId: string): Promise<ReflectionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_reflections')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReflectionRow[];
}

export default function LearnLogReflectionsPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: reflections, isLoading, mutate } = useSWR(
    profile ? ['learnlog-reflections', profile.id] : null,
    () => fetchReflections(profile!.id)
  );

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Reflections" />
      <div className="p-4 flex flex-col gap-4">
        <Button onClick={() => setDrawerOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> New reflection
        </Button>

        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        )}

        {!isLoading && (reflections ?? []).length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No reflections yet. Write your first one.
            </CardContent>
          </Card>
        )}

        {(reflections ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 flex flex-col gap-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{r.body}</p>
              {r.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {r.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {profile && (
        <ReflectionDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
      <LearnLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `/learnlog/reflections`, create an entry with tags, confirm it renders with tags as badges and a formatted date.

- [ ] **Step 4: Commit**

```bash
git add "app/(learnlog)/learnlog/reflections"
git commit -m "feat(learnlog): Reflections section — freeform journal"
```

---

### Task 7: Home page

**Files:**
- Create: `app/(learnlog)/learnlog/page.tsx`

**Interfaces:**
- Consumes: `learnlog_skills`, `learnlog_library_items`, `learnlog_career_goals` tables (Task 1), `StatCard` (existing).

- [ ] **Step 1: Create the Home page**

```tsx
// app/(learnlog)/learnlog/page.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame } from 'lucide-react';
import type { SkillRow, LibraryItemRow, CareerGoalRow } from '@/lib/learnlog/types';

async function fetchHomeData(profileId: string) {
  const supabase = createClient();
  const [skillsRes, libraryRes, goalsRes] = await Promise.all([
    supabase.from('learnlog_skills').select('*').eq('profileId', profileId).order('currentStreak', { ascending: false }),
    supabase.from('learnlog_library_items').select('*').eq('profileId', profileId).eq('status', 'IN_PROGRESS').order('updatedAt', { ascending: false }).limit(1),
    supabase.from('learnlog_career_goals').select('*').eq('profileId', profileId).eq('status', 'active').order('targetDate', { ascending: true }).limit(1),
  ]);
  if (skillsRes.error) throw skillsRes.error;
  if (libraryRes.error) throw libraryRes.error;
  if (goalsRes.error) throw goalsRes.error;
  return {
    skills: (skillsRes.data ?? []) as SkillRow[],
    inProgressBook: (libraryRes.data?.[0] ?? null) as LibraryItemRow | null,
    nextGoal: (goalsRes.data?.[0] ?? null) as CareerGoalRow | null,
  };
}

export default function LearnLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(
    profile ? ['learnlog-home', profile.id] : null,
    () => fetchHomeData(profile!.id)
  );

  const loading = profileLoading || isLoading;
  const skills = data?.skills ?? [];
  const topSkill = skills[0] ?? null;
  const skillCount = skills.length;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="LearnLog" />
      <div className="p-4 flex flex-col gap-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{skillCount}</p>
              <p className="text-xs text-muted-foreground">Skills tracked</p>
            </StatCard>
            <StatCard className="text-center">
              <p className="text-2xl font-bold flex items-center justify-center gap-1">
                {topSkill?.currentStreak ?? 0}
                {(topSkill?.currentStreak ?? 0) > 0 && <Flame className="h-4 w-4" />}
              </p>
              <p className="text-xs text-muted-foreground">Best streak</p>
            </StatCard>
          </div>
        )}

        {!loading && data?.inProgressBook && (
          <Link href="/learnlog/library">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Currently reading/taking</p>
                <p className="font-medium">{data.inProgressBook.title}</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {!loading && data?.nextGoal && (
          <Link href="/learnlog/career">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Next career goal</p>
                <p className="font-medium">{data.nextGoal.title}</p>
                {data.nextGoal.targetDate && <p className="text-xs text-muted-foreground">Target: {data.nextGoal.targetDate}</p>}
              </CardContent>
            </Card>
          </Link>
        )}

        {!loading && skillCount === 0 && !data?.inProgressBook && !data?.nextGoal && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              Nothing tracked yet. Head to Library, Skills, or Career to get started.
            </CardContent>
          </Card>
        )}
      </div>
      <LearnLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, visit `/learnlog`. Confirm stats reflect data added in prior tasks (skill count, best streak, in-progress book, next goal all show correctly).

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/page.tsx"
git commit -m "feat(learnlog): Home page — overview stats and highlights"
```

---

### Task 8: Config page

**Files:**
- Create: `app/(learnlog)/learnlog/config/page.tsx`

**Interfaces:**
- Consumes: `AppConfigShell` (existing), `Profile.learnLogCity`/`learnLogAiEnabled` (Task 1).

- [ ] **Step 1: Create the Config page**

```tsx
// app/(learnlog)/learnlog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AppConfigShell } from '@/components/AppConfigShell';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile, refreshCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';

export default function LearnLogConfigPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useCurrentProfile();

  async function handleCityBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (!profile) return;
    const value = e.target.value.trim();
    const { error } = await supabase.from('profiles').update({ learnLogCity: value || null }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not save city', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
    toast({ description: 'City updated' });
  }

  async function handleAiToggle(checked: boolean) {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ learnLogAiEnabled: checked }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not update setting', description: error.message, variant: 'destructive' });
      return;
    }
    refreshCurrentProfile();
  }

  return (
    <AppConfigShell
      appName="LearnLog"
      onboardingHref="/learnlog/onboarding?returnTo=/learnlog/config"
      exportData={() => ({})}
      bottomNav={<LearnLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>LearnLog settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city">City / region</Label>
            <p className="text-xs text-muted-foreground">Used to suggest nearby classes for your skills.</p>
            <Input id="city" defaultValue={(profile?.learnLogCity as string) ?? ''} onBlur={handleCityBlur} placeholder="e.g. Vancouver, BC" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="aiToggle">AI suggestions</Label>
              <p className="text-xs text-muted-foreground">Nearby-class ideas and onboarding suggestions.</p>
            </div>
            <Switch id="aiToggle" checked={(profile?.learnLogAiEnabled as boolean) ?? true} onCheckedChange={handleAiToggle} />
          </div>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, visit `/learnlog/config`. Set a city, blur the field, confirm the toast and that the value persists on reload. Toggle AI suggestions off/on, confirm it persists. Click "Reonboard" (via `AppConfigShell`'s built-in button) and confirm it navigates to `/learnlog/onboarding` (built in Task 9).

- [ ] **Step 3: Commit**

```bash
git add "app/(learnlog)/learnlog/config"
git commit -m "feat(learnlog): Config page — city, AI toggle, reonboard, export"
```

---

### Task 9: AI onboarding

**Files:**
- Create: `lib/learnlog/onboarding.ts`
- Create: `app/api/ai/learnlog/onboarding/route.ts`
- Create: `app/(learnlog)/learnlog/onboarding/page.tsx`

**Interfaces:**
- Consumes: `getModel`, `formatAiError` (existing, from `lib/ai/modelConfig.ts`/`lib/ai/errors.ts`).
- Produces: `POST /api/ai/learnlog/onboarding` → `{ skills: string[], careerGoal: string, libraryItems: { type: 'BOOK'|'COURSE', title: string }[] }`.

- [ ] **Step 1: Create `lib/learnlog/onboarding.ts` (prompt + validation)**

```ts
// lib/learnlog/onboarding.ts

export interface OnboardingRequest {
  interests: string;
  readingGoals: string;
  careerFocus: string;
}

export interface OnboardingResult {
  skills: string[];
  careerGoal: string;
  libraryItems: { type: 'BOOK' | 'COURSE'; title: string }[];
}

export function buildOnboardingSystemPrompt(): string {
  return 'You are a thoughtful learning coach helping someone set up a personal learning tracker. Given their interests, reading goals, and career focus, you suggest a small, realistic starting set of skills to track, one career goal, and a couple of books/courses to add. You respond with valid JSON only — no markdown, no prose, no code fences.';
}

export function buildOnboardingUserPrompt(req: OnboardingRequest): string {
  return `Interests/skills they want to develop: ${req.interests}
Reading/learning goals: ${req.readingGoals}
Career focus: ${req.careerFocus}

Suggest:
- 2 to 3 skills (short names, e.g. "Skiing", "Public speaking")
- 1 career goal (one sentence, specific and achievable)
- 2 to 3 library items (books or courses) relevant to their interests, with type and a real, specific title

Respond with ONLY valid JSON matching this schema exactly:
{
  "skills": ["Skiing", "Public speaking"],
  "careerGoal": "One sentence career goal.",
  "libraryItems": [
    { "type": "BOOK", "title": "Real book title" },
    { "type": "COURSE", "title": "Real course title" }
  ]
}`;
}

function isLibraryItemSeed(v: unknown): v is { type: 'BOOK' | 'COURSE'; title: string } {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (s.type === 'BOOK' || s.type === 'COURSE') && typeof s.title === 'string' && s.title.length > 0;
}

export function validateOnboardingResponse(raw: unknown): OnboardingResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.skills) || r.skills.length === 0) {
    throw new Error('AI response is missing a "skills" array');
  }
  if (typeof r.careerGoal !== 'string' || !r.careerGoal.trim()) {
    throw new Error('AI response is missing "careerGoal"');
  }
  if (!Array.isArray(r.libraryItems)) {
    throw new Error('AI response is missing a "libraryItems" array');
  }

  const skills = r.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  const libraryItems = r.libraryItems.filter(isLibraryItemSeed);

  if (skills.length === 0) {
    throw new Error('AI response contained no valid skills');
  }

  return { skills, careerGoal: r.careerGoal.trim(), libraryItems };
}
```

- [ ] **Step 2: Create the API route**

```ts
// app/api/ai/learnlog/onboarding/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import {
  buildOnboardingSystemPrompt,
  buildOnboardingUserPrompt,
  validateOnboardingResponse,
  type OnboardingRequest,
} from '@/lib/learnlog/onboarding';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<OnboardingRequest>;
    if (!body.interests || !body.readingGoals || !body.careerFocus) {
      return NextResponse.json({ error: 'Missing required onboarding inputs' }, { status: 400 });
    }

    const req: OnboardingRequest = {
      interests: body.interests,
      readingGoals: body.readingGoals,
      careerFocus: body.careerFocus,
    };

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [
        { role: 'system', content: buildOnboardingSystemPrompt() },
        { role: 'user', content: buildOnboardingUserPrompt(req) },
      ],
      response_format: { type: 'json_object' },
    });

    if (!completion.choices || completion.choices.length === 0) {
      const providerError = (completion as unknown as { error?: { message?: string } }).error;
      throw new Error(providerError?.message || 'AI provider returned no response choices');
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = validateOnboardingResponse(parsed);
    return NextResponse.json(result);
  } catch (error) {
    console.error('learnlog onboarding error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the onboarding UI**

```tsx
// app/(learnlog)/learnlog/onboarding/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingResult } from '@/lib/learnlog/onboarding';

export default function LearnLogOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/learnlog';
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const supabase = createClient();

  const [interests, setInterests] = useState('');
  const [readingGoals, setReadingGoals] = useState('');
  const [careerFocus, setCareerFocus] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [wantsGoal, setWantsGoal] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/learnlog/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests, readingGoals, careerFocus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate suggestions');
      setResult(data as OnboardingResult);
      setSelectedSkills(new Set((data as OnboardingResult).skills));
      setSelectedItems(new Set((data as OnboardingResult).libraryItems.map((_, i) => i)));
    } catch (err) {
      toast({ title: 'Could not generate suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept() {
    if (!profile || !result) return;
    setSaving(true);
    try {
      const skillRows = Array.from(selectedSkills).map((name) => ({ profileId: profile.id, name }));
      if (skillRows.length > 0) {
        const { error } = await supabase.from('learnlog_skills').insert(skillRows);
        if (error) throw error;
      }

      if (wantsGoal && result.careerGoal) {
        const { error } = await supabase.from('learnlog_career_goals').insert({
          profileId: profile.id,
          title: result.careerGoal,
          status: 'active',
        });
        if (error) throw error;
      }

      const itemRows = result.libraryItems
        .filter((_, i) => selectedItems.has(i))
        .map((item) => ({ profileId: profile.id, type: item.type, title: item.title, status: 'WANT' }));
      if (itemRows.length > 0) {
        const { error } = await supabase.from('learnlog_library_items').insert(itemRows);
        if (error) throw error;
      }

      toast({ description: 'LearnLog set up!' });
      router.push(returnTo);
    } catch (err) {
      toast({ title: 'Could not save your selections', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Set up LearnLog" onClose={() => router.push(returnTo)} />
      <div className="p-4 flex flex-col gap-4">
        {!result && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="interests">What skills or hobbies are you developing?</Label>
              <Textarea id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="e.g. skiing, boxing, learning guitar" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="readingGoals">What do you want to read or take a course on?</Label>
              <Textarea id="readingGoals" value={readingGoals} onChange={(e) => setReadingGoals(e.target.value)} placeholder="e.g. leadership, machine learning" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="careerFocus">What's your career focus right now?</Label>
              <Textarea id="careerFocus" value={careerFocus} onChange={(e) => setCareerFocus(e.target.value)} placeholder="e.g. growing into a senior engineering role" />
            </div>
            <Button className="w-full" onClick={handleGenerate} disabled={generating || !interests.trim() || !readingGoals.trim() || !careerFocus.trim()}>
              {generating ? 'Generating…' : 'Generate suggestions'}
            </Button>
          </>
        )}

        {result && (
          <>
            <Card>
              <CardContent className="pt-4 flex flex-col gap-2">
                <p className="font-medium text-sm">Skills to track</p>
                {result.skills.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedSkills.has(s)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedSkills);
                        if (v) next.add(s); else next.delete(s);
                        setSelectedSkills(next);
                      }}
                    />
                    <span className="text-sm">{s}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex items-center gap-2">
                <Checkbox checked={wantsGoal} onCheckedChange={(v) => setWantsGoal(!!v)} />
                <span className="text-sm">{result.careerGoal}</span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex flex-col gap-2">
                <p className="font-medium text-sm">Library</p>
                {result.libraryItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedItems.has(i)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedItems);
                        if (v) next.add(i); else next.delete(i);
                        setSelectedItems(next);
                      }}
                    />
                    <span className="text-sm">{item.title} ({item.type === 'BOOK' ? 'Book' : 'Course'})</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button className="w-full" onClick={handleAccept} disabled={saving}>
              {saving ? 'Saving…' : 'Add to LearnLog'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, visit `/learnlog/onboarding`, fill the three fields, generate, uncheck one skill and one library item, accept. Confirm the checked items appear in Skills/Career/Library and unchecked ones do not.

- [ ] **Step 5: Commit**

```bash
git add lib/learnlog/onboarding.ts "app/api/ai/learnlog/onboarding" "app/(learnlog)/learnlog/onboarding"
git commit -m "feat(learnlog): AI onboarding flow"
```

---

### Task 10: AI local class suggestions ("Find nearby classes")

**Files:**
- Create: `lib/learnlog/suggestions.ts`
- Create: `app/api/ai/learnlog/suggestions/route.ts`
- Modify: `app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx`

**Interfaces:**
- Consumes: `Skill.category`/`name`, `Profile.learnLogCity` (Task 1), `Profile.learnLogAiEnabled`.
- Produces: `POST /api/ai/learnlog/suggestions` → `{ ideas: { title: string, provider: string, rationale: string }[] }`.

- [ ] **Step 1: Create `lib/learnlog/suggestions.ts`**

```ts
// lib/learnlog/suggestions.ts

export interface ClassSuggestionsRequest {
  skillName: string;
  skillCategory: string | null;
  city: string;
  budgetHint: string | null;
}

export interface ClassIdea {
  title: string;
  provider: string;
  rationale: string;
}

export interface ClassSuggestionsResponse {
  ideas: ClassIdea[];
}

export function buildSuggestionsSystemPrompt(): string {
  return 'You are a local activities advisor. Given a skill someone wants to practice and their city, you suggest plausible types of classes or providers that likely exist there. You are NOT connected to real listings — your ideas are illustrative, not verified. You respond with valid JSON only — no markdown, no prose, no code fences.';
  // Seam for a future Tavily/LangGraph-backed real-search implementation:
  // getLocalClassIdeas() below is where a search-backed lookup would replace this LLM call.
}

export function buildSuggestionsUserPrompt(req: ClassSuggestionsRequest): string {
  return `Suggest 3 to 5 plausible class or lesson ideas for someone learning "${req.skillName}"${req.skillCategory ? ` (category: ${req.skillCategory})` : ''} in ${req.city}.
${req.budgetHint ? `Budget consideration: ${req.budgetHint}` : ''}

Requirements:
- provider should be a realistic type of place (e.g. "local ski resort", "community climbing gym"), not a fabricated business name.
- rationale is one sentence on why this fits the skill and city.

Respond with ONLY valid JSON matching this schema exactly:
{
  "ideas": [
    { "title": "Beginner lesson type", "provider": "Realistic provider type", "rationale": "One sentence." }
  ]
}`;
}

function isClassIdea(v: unknown): v is ClassIdea {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.title === 'string' && typeof s.provider === 'string' && typeof s.rationale === 'string';
}

export function validateSuggestionsResponse(raw: unknown): ClassSuggestionsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.ideas) || r.ideas.length === 0) {
    throw new Error('AI response is missing an "ideas" array');
  }
  const valid = r.ideas.filter(isClassIdea);
  if (valid.length === 0) {
    throw new Error('AI response contained no valid ideas');
  }
  return { ideas: valid };
}
```

- [ ] **Step 2: Create the API route**

```ts
// app/api/ai/learnlog/suggestions/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import {
  buildSuggestionsSystemPrompt,
  buildSuggestionsUserPrompt,
  validateSuggestionsResponse,
  type ClassSuggestionsRequest,
} from '@/lib/learnlog/suggestions';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<ClassSuggestionsRequest>;
    if (!body.skillName || !body.city) {
      return NextResponse.json({ error: 'Missing required suggestion inputs' }, { status: 400 });
    }

    const req: ClassSuggestionsRequest = {
      skillName: body.skillName,
      skillCategory: body.skillCategory ?? null,
      city: body.city,
      budgetHint: body.budgetHint ?? null,
    };

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [
        { role: 'system', content: buildSuggestionsSystemPrompt() },
        { role: 'user', content: buildSuggestionsUserPrompt(req) },
      ],
      response_format: { type: 'json_object' },
    });

    if (!completion.choices || completion.choices.length === 0) {
      const providerError = (completion as unknown as { error?: { message?: string } }).error;
      throw new Error(providerError?.message || 'AI provider returned no response choices');
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = validateSuggestionsResponse(parsed);
    return NextResponse.json(result);
  } catch (error) {
    console.error('learnlog suggestions error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Replace the `NearbyClassesCard` placeholder with the real trigger + list**

```tsx
// app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx
'use client';

import { useState } from 'react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import type { SkillRow } from '@/lib/learnlog/types';
import type { ClassIdea } from '@/lib/learnlog/suggestions';

type NearbyClassesCardProps = {
  skill: SkillRow;
};

export function NearbyClassesCard({ skill }: NearbyClassesCardProps) {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<ClassIdea[] | null>(null);

  const city = (profile?.learnLogCity as string) || '';
  const aiEnabled = (profile?.learnLogAiEnabled as boolean) ?? true;

  async function handleFind() {
    if (!city) {
      toast({ title: 'Set your city first', description: 'Add a city in LearnLog Config to get suggestions.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/learnlog/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: skill.name, skillCategory: skill.category, city }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestions');
      setIdeas(data.ideas as ClassIdea[]);
    } catch (err) {
      toast({ title: 'Could not get suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!aiEnabled) return null;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Nearby classes</p>
          <Button size="sm" variant="outline" onClick={handleFind} disabled={loading}>
            {loading ? 'Finding…' : 'Find nearby classes'}
          </Button>
        </div>
        {ideas && (
          <>
            <p className="text-xs text-muted-foreground">AI-generated ideas, not verified listings.</p>
            {ideas.map((idea, i) => (
              <div key={i} className="text-sm">
                <p className="font-medium">{idea.title}</p>
                <p className="text-xs text-muted-foreground">{idea.provider} — {idea.rationale}</p>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, set a city in `/learnlog/config`, visit a skill's detail page, click "Find nearby classes". Confirm 3-5 ideas render with the "not verified listings" disclaimer. Turn off AI suggestions in Config and confirm the card disappears from the skill detail page.

- [ ] **Step 5: Commit**

```bash
git add lib/learnlog/suggestions.ts "app/api/ai/learnlog/suggestions" "app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx"
git commit -m "feat(learnlog): AI-generated nearby-class suggestions"
```

---

### Task 11: LogBook hub integration — summary card

**Files:**
- Create: `components/LearnLogSummaryCard.tsx`
- Modify: LogBook's Today digest page (locate the existing card grid — find via `grep -rn "SummaryCard" app/\(logbook\)`)

**Interfaces:**
- Consumes: `learnlog_skills`, `learnlog_library_items`, `learnlog_career_goals` tables.
- Produces: `<LearnLogSummaryCard profileId />` slotted into LogBook's existing card grid.

- [ ] **Step 1: Find the existing summary-card pattern**

Run: `grep -rln "SummaryCard" app/\(logbook\)` and open the first match to see how another app's card (e.g. `TaskLogSummaryCard` or similar) is structured and where it's placed in the grid. Match that exact shape and import location for `LearnLogSummaryCard`.

- [ ] **Step 2: Create `components/LearnLogSummaryCard.tsx`**

```tsx
// components/LearnLogSummaryCard.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { LearnLogMark } from '@/components/LearnLogMark';
import { Flame } from 'lucide-react';

type LearnLogSummaryCardProps = {
  profileId: string;
};

async function fetchSummary(profileId: string) {
  const supabase = createClient();
  const [skillsRes, libraryRes] = await Promise.all([
    supabase.from('learnlog_skills').select('name,currentStreak').eq('profileId', profileId).order('currentStreak', { ascending: false }).limit(1),
    supabase.from('learnlog_library_items').select('title').eq('profileId', profileId).eq('status', 'IN_PROGRESS').order('updatedAt', { ascending: false }).limit(1),
  ]);
  return {
    topSkill: skillsRes.data?.[0] as { name: string; currentStreak: number } | undefined,
    inProgressTitle: libraryRes.data?.[0]?.title as string | undefined,
  };
}

export function LearnLogSummaryCard({ profileId }: LearnLogSummaryCardProps) {
  const { data } = useSWR(['learnlog-summary', profileId], () => fetchSummary(profileId));

  return (
    <Link href="/learnlog">
      <Card>
        <CardContent className="pt-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <LearnLogMark size={18} />
            <span className="text-sm font-medium">LearnLog</span>
          </div>
          {data?.topSkill ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {data.topSkill.name}
              {data.topSkill.currentStreak > 0 && (
                <span className="flex items-center"><Flame className="h-3 w-3 mx-0.5" />{data.topSkill.currentStreak}</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No skills tracked yet</p>
          )}
          {data?.inProgressTitle && (
            <p className="text-xs text-muted-foreground">Reading: {data.inProgressTitle}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3: Wire it into the LogBook digest grid**

In the file found in Step 1, add the import and render `<LearnLogSummaryCard profileId={profile.id} />` in the same card-grid container as the other apps' summary cards, following the exact same conditional-rendering pattern used there (e.g. gated on `enabledApps` if that's how the grid decides which cards to show).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, visit the LogBook Today page. Confirm a LearnLog card appears in the grid showing the top-streak skill and in-progress book/course, and that clicking it navigates to `/learnlog`.

- [ ] **Step 5: Commit**

```bash
git add components/LearnLogSummaryCard.tsx
git add -u
git commit -m "feat(learnlog): LogBook hub summary card"
```

---

### Task 12: TaskLog integration — "Add to TaskLog"

**Files:**
- Create: `lib/learnlog/crossApp.ts`
- Modify: `app/(learnlog)/learnlog/library/page.tsx` (or item card) — add the action button
- Modify: `app/(learnlog)/learnlog/skills/[id]/page.tsx` — add the action button

**Interfaces:**
- Produces: `createTaskLogTask(profileId, title, category, notes?): Promise<void>` — used by Library and Skills.

- [ ] **Step 1: Create `lib/learnlog/crossApp.ts` with the TaskLog helper**

```ts
// lib/learnlog/crossApp.ts
import { createClient } from '@/lib/supabase/client';

/** Creates a TaskLog task sourced from a LearnLog item — mirrors how TravelLog's
 * Plan flow creates logistics/day tasks (no formal FK back to LearnLog; the
 * notes field carries the back-reference, matching the low-friction pattern
 * used elsewhere for cross-app task creation). */
export async function createTaskLogTask(
  profileId: string,
  title: string,
  category: 'life' | 'work',
  sourceLabel: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('tasks').insert({
    profileId,
    title,
    category,
    priority: 'medium',
    notes: `From LearnLog · ${sourceLabel}`,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Add the action to the Library item card**

In `app/(learnlog)/learnlog/library/page.tsx`, add an "Add to TaskLog" button to each item card:

```tsx
// add to imports
import { createTaskLogTask } from '@/lib/learnlog/crossApp';
import { useToast } from '@/components/ui/use-toast';

// inside LearnLogLibraryPage, add:
const { toast } = useToast();
async function handleAddToTaskLog(item: LibraryItemRow) {
  if (!profile) return;
  try {
    await createTaskLogTask(profile.id, `Read/study: ${item.title}`, 'life', item.title);
    toast({ description: 'Added to TaskLog.' });
  } catch (err) {
    toast({ title: 'Could not add to TaskLog', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
  }
}
```

Add a button inside each item's `CardContent`, after the badges row:

```tsx
<Button size="sm" variant="outline" onClick={() => handleAddToTaskLog(item)}>Add to TaskLog</Button>
```

- [ ] **Step 3: Add the action to the Skill detail page**

In `app/(learnlog)/learnlog/skills/[id]/page.tsx`, add the same helper call for a practice-session task:

```tsx
// add to imports
import { createTaskLogTask } from '@/lib/learnlog/crossApp';
import { useToast } from '@/components/ui/use-toast';

// inside SkillDetailPage:
const { toast } = useToast();
async function handleAddToTaskLog() {
  try {
    await createTaskLogTask(skill.profileId, `Practice: ${skill.name}`, 'life', skill.name);
    toast({ description: 'Added to TaskLog.' });
  } catch (err) {
    toast({ title: 'Could not add to TaskLog', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
  }
}
```

Add a button next to "Log a session":

```tsx
<Button variant="outline" className="w-full" onClick={handleAddToTaskLog}>Queue a practice session in TaskLog</Button>
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. From a Library item, click "Add to TaskLog", then visit `/tasklog` and confirm a new task titled "Read/study: <title>" appears in the Plan inbox with a note referencing LearnLog. Repeat for a Skill's "Queue a practice session".

- [ ] **Step 5: Commit**

```bash
git add lib/learnlog/crossApp.ts "app/(learnlog)/learnlog/library/page.tsx" "app/(learnlog)/learnlog/skills/[id]/page.tsx"
git commit -m "feat(learnlog): TaskLog integration — add practice/reading tasks"
```

---

### Task 13: MoneyLog integration — "Log to MoneyLog"

**Files:**
- Modify: `lib/financeCategories.ts` — add `education` expense category
- Modify: `lib/learnlog/crossApp.ts` — add `logToMoneyLog` helper
- Modify: `app/(learnlog)/learnlog/library/page.tsx` — add the action for costed items

**Interfaces:**
- Consumes: `EXPENSE_CATEGORIES` (existing).
- Produces: `logToMoneyLog(profileId, label, amount): Promise<void>`.

- [ ] **Step 1: Add the `education` expense category**

In `lib/financeCategories.ts`, add to `EXPENSE_CATEGORIES` (before `other_expense`):

```ts
  { value: 'education', label: 'Education' },
```

- [ ] **Step 2: Add `logToMoneyLog` to `lib/learnlog/crossApp.ts`**

```ts
// append to lib/learnlog/crossApp.ts

/** Logs a LearnLog cost (course fee, gear, book) as a MoneyLog expense. */
export async function logToMoneyLog(profileId: string, label: string, amount: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('finance_transactions').insert({
    profileId,
    type: 'expense',
    category: 'education',
    label,
    amount,
  });
  if (error) throw error;
}
```

- [ ] **Step 3: Add the action to costed Library items**

In `app/(learnlog)/learnlog/library/page.tsx`, add to imports:

```tsx
import { logToMoneyLog } from '@/lib/learnlog/crossApp';
```

Add a handler:

```tsx
async function handleLogToMoneyLog(item: LibraryItemRow) {
  if (!profile || item.cost == null) return;
  try {
    await logToMoneyLog(profile.id, item.title, item.cost);
    toast({ description: 'Logged to MoneyLog.' });
  } catch (err) {
    toast({ title: 'Could not log to MoneyLog', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
  }
}
```

Render the button only when `item.cost != null`, next to the "Add to TaskLog" button:

```tsx
{item.cost != null && (
  <Button size="sm" variant="outline" onClick={() => handleLogToMoneyLog(item)}>Log to MoneyLog (${item.cost})</Button>
)}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Add a Library item with a cost, click "Log to MoneyLog ($X)", visit `/moneylog` and confirm an "Education" expense for that amount and label appears.

- [ ] **Step 5: Commit**

```bash
git add lib/financeCategories.ts lib/learnlog/crossApp.ts "app/(learnlog)/learnlog/library/page.tsx"
git commit -m "feat(learnlog): MoneyLog integration — log costed items as expenses"
```

---

### Task 14: TravelLog integration — destination-aware suggestions and related trips

**Files:**
- Modify: `lib/learnlog/suggestions.ts` — extend request/prompt with optional destination
- Modify: `app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx` — pass matching trip destination
- Modify: `app/(learnlog)/learnlog/skills/[id]/page.tsx` — add "Related trips" chip

**Interfaces:**
- Consumes: `travellog_visits` table (existing, read-only).
- Produces: `NearbyClassesCard` now optionally biases suggestions toward an upcoming trip destination matching the skill's category.

- [ ] **Step 1: Extend `ClassSuggestionsRequest` and the prompt to accept an optional destination**

In `lib/learnlog/suggestions.ts`, update the interface and prompt builder:

```ts
export interface ClassSuggestionsRequest {
  skillName: string;
  skillCategory: string | null;
  city: string;
  budgetHint: string | null;
  upcomingDestination: string | null; // new
}
```

In `buildSuggestionsUserPrompt`, change the opening line to:

```ts
export function buildSuggestionsUserPrompt(req: ClassSuggestionsRequest): string {
  const destinationNote = req.upcomingDestination
    ? ` They also have an upcoming trip to ${req.upcomingDestination} — if relevant, include at least one idea suited to that destination instead of only their home city.`
    : '';
  return `Suggest 3 to 5 plausible class or lesson ideas for someone learning "${req.skillName}"${req.skillCategory ? ` (category: ${req.skillCategory})` : ''} in ${req.city}.${destinationNote}
${req.budgetHint ? `Budget consideration: ${req.budgetHint}` : ''}
...
```
(keep the rest of the function body — Requirements and schema block — unchanged)

- [ ] **Step 2: Update the onboarding/suggestions API route body validation to pass the new optional field through**

In `app/api/ai/learnlog/suggestions/route.ts`, update the request construction:

```ts
    const req: ClassSuggestionsRequest = {
      skillName: body.skillName,
      skillCategory: body.skillCategory ?? null,
      city: body.city,
      budgetHint: body.budgetHint ?? null,
      upcomingDestination: body.upcomingDestination ?? null,
    };
```

- [ ] **Step 3: Query upcoming trips in `NearbyClassesCard` and pass a matching destination**

In `app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx`, add a query for upcoming `travellog_visits` and pick one whose `country`/`placeName` loosely matches the skill's category, then include it in the request body:

```tsx
// add to imports
import useSWR from 'swr';

// add inside NearbyClassesCard, before handleFind:
async function fetchUpcomingDestination(profileId: string, category: string | null): Promise<string | null> {
  if (!category) return null;
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('travellog_visits')
    .select('placeName,country')
    .eq('profileId', profileId)
    .gte('arrivalDate', today)
    .order('arrivalDate', { ascending: true })
    .limit(5);
  const match = (data ?? []).find((v: { placeName: string; country: string }) =>
    `${v.placeName} ${v.country}`.toLowerCase().includes(category.toLowerCase())
  );
  return match ? `${match.placeName}, ${match.country}` : null;
}
```

Note: `createClient` is already imported in this file from Task 10's implementation — add it if not present. Update `handleFind` to look up and include the destination:

```tsx
  async function handleFind() {
    if (!city) {
      toast({ title: 'Set your city first', description: 'Add a city in LearnLog Config to get suggestions.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const upcomingDestination = profile ? await fetchUpcomingDestination(profile.id, skill.category) : null;
      const res = await fetch('/api/ai/learnlog/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: skill.name, skillCategory: skill.category, city, upcomingDestination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestions');
      setIdeas(data.ideas as ClassIdea[]);
    } catch (err) {
      toast({ title: 'Could not get suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 4: Add a "Related trips" chip to the Skill detail page**

In `app/(learnlog)/learnlog/skills/[id]/page.tsx`, add a query and chip. Add to imports:

```tsx
import { createClient } from '@/lib/supabase/client';
```
(already imported) — add a new SWR fetch near the existing ones:

```tsx
async function fetchRelatedTrips(profileId: string, category: string | null) {
  if (!category) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('id,placeName,country')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []).filter((v: { placeName: string; country: string }) =>
    `${v.placeName} ${v.country}`.toLowerCase().includes(category.toLowerCase())
  );
}
```

Inside `SkillDetailPage`, after `skill` loads:

```tsx
  const { data: relatedTrips } = useSWR(
    skill ? ['learnlog-related-trips', skill.profileId, skill.category] : null,
    () => fetchRelatedTrips(skill!.profileId, skill!.category)
  );
```

Render a chip row under the level/streak card when there are matches:

```tsx
{relatedTrips && relatedTrips.length > 0 && (
  <div className="flex gap-2 flex-wrap">
    {relatedTrips.map((t: { id: string; placeName: string; country: string }) => (
      <Badge key={t.id} variant="outline">Related trip: {t.placeName}, {t.country}</Badge>
    ))}
  </div>
)}
```

Add `Badge` to the imports if not already present (`import { Badge } from '@/components/ui/badge';`).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Log a future TravelLog visit whose country or place name matches a skill's category text (e.g. skill category "winter sports", trip to "Whistler, Canada" — note the match is a simple substring check, so use a category value that appears in the place/country string for this test). Visit the skill detail page and confirm the "Related trip" badge appears, and that clicking "Find nearby classes" produces at least one destination-flavored idea.

- [ ] **Step 6: Commit**

```bash
git add lib/learnlog/suggestions.ts "app/api/ai/learnlog/suggestions/route.ts" "app/(learnlog)/learnlog/skills/[id]"
git commit -m "feat(learnlog): TravelLog integration — destination-aware suggestions, related trips"
```

---

### Task 15: Root README updates

**Files:**
- Modify: `README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Add LearnLog to the apps table**

Add a row after the TravelLog row (line ~24):

```markdown
| **LearnLog** | `/learnlog` | Lifelong learning: books/courses, skills with leveling, career, reflections | [`app/(learnlog)/README.md`](app/(learnlog)/README.md) |
```

- [ ] **Step 2: Add a Features subsection**

After the "### TravelLog" subsection (around line 96), add:

```markdown
### LearnLog (lifelong learning)

- Library — books & courses with a Want/In Progress/Completed pipeline, progress, notes, rating, source link
- Skills — practical/physical skills (skiing, boxing, climbing, etc.) with BurnLog-style level/XP/streak tracking, session logging, milestones
- AI "Find nearby classes" — AI-generated (not verified) local class ideas per skill, destination-aware when an upcoming TravelLog trip matches
- Career — role timeline, certifications with expiry flags, career goals
- Reflections — freeform journal with tags
- AI onboarding — suggests starter skills, a career goal, and library items
- Config — city/region setting, AI-suggestions toggle, export config as JSON
```

- [ ] **Step 3: Update the cross-cutting features and directory tree mentions**

In the "Cross-cutting features" section, extend the app count reference from eight to nine apps wherever it's stated numerically, and add LearnLog to the directory tree listing near line 258:

```markdown
  (learnlog)/learnlog/ LearnLog — see app/(learnlog)/README.md
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add LearnLog to root README"
```

---

## Self-Review Notes

- **Spec coverage:** App shell (Task 2), 6 models (Task 1), Library (3), Skills+leveling (4), Career (5), Reflections (6), Home (7), Config (8), AI onboarding (9), AI local suggestions (10), LogBook integration (11), TaskLog integration (12), MoneyLog integration (13), TravelLog integration (14), README (15) — every spec section maps to a task.
- **Placeholder scan:** No TBD/TODO; the one inline comment marking the Tavily/LangGraph seam in Task 10 is spec-mandated documentation, not a placeholder for missing code — `getLocalClassIdeas`-equivalent logic (the LLM call) is fully implemented.
- **Type consistency:** `SkillRow`/`LibraryItemRow`/etc. defined once in Task 3's `lib/learnlog/types.ts`, imported identically in Tasks 4-14. `computeLevel`/`computeStreakUpdate` signatures matched exactly against their existing implementation in `lib/leveling.ts`. `createTaskLogTask`/`logToMoneyLog` signatures defined in Task 12/13 and used with matching argument order in the same tasks that define them.
- **Gap found and fixed during self-review:** `Badge` is used in Tasks 3, 5, 6, and 14 but does not exist anywhere in this codebase (verified by search). Added its creation as Task 3, Step 0 (first task that needs it) using the same `cva`-based pattern as the existing `button.tsx`, with `class-variance-authority` confirmed already a dependency — no new package installs required.
