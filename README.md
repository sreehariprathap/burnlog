# LogBook

LogBook is a single Next.js app that bundles eight "life-tracking" mini-apps
behind one login, one profile, and one bottom-nav shell. **LogBook itself is
the entry point** — after login every user lands on `/logbook`, a daily
digest that pulls a summary card from each sub-app they use (streaks, today's
spend, open tasks, etc). From there they switch into whichever sub-app they
want via the app switcher.

> Historically this repo was BurnLog (a fitness tracker) and grew the other
> logs around it. The `/` → `/logbook` redirect and `/login` → `/logbook`
> flow (see `middleware.ts`) reflect the switch: **LogBook, not BurnLog, is
> the front door now.** BurnLog is still fully functional as a sub-app — see
> its own doc below.

## The apps

| App | Route | What it's for | Docs |
|---|---|---|---|
| **LogBook** | `/logbook` | Hub: cross-app daily digest, streaks, morning brief, "My Day" planner, quick-add | [`app/(logbook)/README.md`](app/(logbook)/README.md) |
| **BurnLog** | `/burnlog/dashboard` | Fitness tracking: workouts, weight/BMI, meal planner, AI-assisted onboarding | [`app/(burnlog)/README.md`](app/(burnlog)/README.md) |
| **MoneyLog** | `/moneylog` | Personal finance: transactions, budgets, financial goals, insights | [`app/(moneylog)/README.md`](app/(moneylog)/README.md) |
| **TaskLog** | `/tasklog` | Task/goal management: kanban board, plans, goals, idea log | [`app/(tasklog)/README.md`](app/(tasklog)/README.md) |
| **TravelLog** | `/travellog` | Travel tracking: visit log, exploration map, AI-assisted trip planning | [`app/(travellog)/README.md`](app/(travellog)/README.md) |
| **HomeLog** | `/homelog` | Household management: chores, bills, shared inventory, expense splitting | [`app/(homelog)/README.md`](app/(homelog)/README.md) |
| **SocialLog** | `/sociallog` | Social feed: posts, follows, friends, messaging, leaderboards | [`app/(sociallog)/README.md`](app/(sociallog)/README.md) |
| **ShoppingLog** | `/shoppinglog` | Marketplace: buy/sell listings, cart, orders, favorites | [`app/(shoppinglog)/README.md`](app/(shoppinglog)/README.md) |
| **LearnLog** | `/learnlog` | Lifelong learning: books/courses, skills with leveling, career, reflections | [`app/(learnlog)/README.md`](app/(learnlog)/README.md) |

Each sub-app doc covers what that app does, its routes, its data models, and
any app-specific setup — this README only covers what's shared across all of
them.

## Features

Full feature breakdown per app, from core to minor. See each app's own
README (linked above) for routes, data models, and key files.

### LogBook (hub)

- Today digest — per-day Life Score ring (switchable Today/Streak/Goal mode,
  averaged across all enabled sub-apps), a 30-day trend chart, streak badge,
  morning brief, activity timeline, and a grid of summary cards (one per
  enabled sub-app)
- Morning brief flow (`/logbook/morning`)
- My Day — lightweight time-blocked day planner, independent of TaskLog's
  kanban board
- Quick add — floating action button for fast cross-app logging without
  switching apps
- Shared identity/profile (`/profile`): avatar, name, username, email,
  default-app picker, logout
- Admin-only global tools: push-notification testing, AI model settings
- Idea log (shared `Idea` model, also surfaced from TaskLog)

### BurnLog (fitness)

- Dashboard — daily activity ring, stats, quick links
- Workout sessions — Push/Pull/Legs, cardio, full-body, rest days; set/rep/
  weight tracking
- Goals — create and monitor fitness goals
- Insights — charts/trends for weight, workouts, calories
- Meal planner — AI-assisted meal planning, with grocery-list generator
- AI onboarding — conversational setup that asks about goals/activity level
  and generates an initial workout plan; relaunchable as "Reonboard"
- Config — health metrics (BMI/BMR), level/XP/streak card, AI insights
  toggle, water tracking, meal-planner settings, export config as JSON

### MoneyLog (personal finance)

- Home — spending overview, recent transactions
- Budget planning (Plan tab)
- Financial goals — savings targets, debt payoff, etc.
- Insights — spending trends and charts
- Onboarding — budget-setup wizard for new users, relaunchable as "Reonboard"
- Config — MoneyLog settings, export config as JSON

### TaskLog (tasks & goals)

- Home — task overview
- Kanban board — track tasks through stages
- Plan — planning view
- Goals — goal tracking, separate from task items
- Idea log (shared with LogBook's quick-add)
- My Day time-blocking (also surfaced in LogBook's hub)
- Config — export config as JSON (no onboarding flow yet)

### TravelLog (travel tracking)

- Home — visit stats (total visits, countries, explored stops)
- Map — Snapchat-Maps-style exploration map; log-a-visit form; chronological
  visit connections; multi-day stays render as a pulsing hotspot
- AI trip planner (Plan tab) — fill in trip details, review a generated
  day-by-day itinerary, accept to save the plan, auto-log it as a visit, and
  create TaskLog tasks (logistics + one per day)
- AI suggestions — affordable-trip ideas based on real free-time windows
  (TaskLog/LogBook), disposable income (MoneyLog), and upcoming public
  holidays in the user's country; "Plan this trip" deep-links into Plan
  prefilled
- Config — country setting (drives holiday lookup), other TravelLog settings

### HomeLog (household management)

- Home — household overview
- Chores — recurring/assigned chores and chore instances
- Bills — shared bills/expenses with expense splitting and settlement
  between household members
- Shared inventory — household inventory and shopping-list items
- Multi-member households with invites (the one sub-app built around shared,
  multi-person state rather than single-user data)
- Config — export config as JSON (no onboarding flow yet)

### SocialLog (social feed)

- Home feed — posts with topics, votes, comments
- Friends/follows
- Life Score leaderboard (`/sociallog/leaderboard`) — mutual follows ranked
  by daily engagement score, linked from Search
- Search — find other users by username
- Direct messaging — threads and messages between users
- Config — SocialLog-specific settings, export config as JSON

### ShoppingLog (marketplace)

- Home — browse listings (organized by category)
- Listing detail view
- Sell — create/manage your own listings, with images
- Cart — add items before checkout
- Orders — order history as buyer or seller, with reviews on completed
  orders
- Favorites — saved/favorited listings
- Config — export config as JSON (no onboarding flow yet)

### LearnLog (lifelong learning)

- Library — books & courses with a Want/In Progress/Completed pipeline, progress, notes, rating, source link
- Skills — practical/physical skills (skiing, boxing, climbing, etc.) with BurnLog-style level/XP/streak tracking, session logging, milestones
- AI "Find nearby classes" — AI-generated (not verified) local class ideas per skill, destination-aware when an upcoming TravelLog trip matches
- Career — role timeline, certifications with expiry flags, career goals
- Reflections — freeform journal with tags
- AI onboarding — suggests starter skills, a career goal, and library items
- Config — city/region setting, AI-suggestions toggle, export config as JSON

### Cross-cutting features (shared across all apps)

- Single login/signup/profile shared across all nine apps
- App switcher with per-app theming (`lib/appMode.ts` registry)
- Per-app Config pages, each with "Export config as JSON"
- AI-assisted flows (OpenAI/OpenRouter): BurnLog onboarding & meal planning,
  MoneyLog insights, TravelLog planning & suggestions, LearnLog onboarding
  & nearby-class suggestions
- Installable PWA with offline support and push notifications
  (`PWA_README.md`)
- Native iOS/Android shells via Capacitor

## How the app works

### One Next.js app, nine route groups

All nine apps live in the same `app/` directory as [Next.js route
groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) —
`app/(logbook)`, `app/(burnlog)`, `app/(moneylog)`, `app/(tasklog)`,
`app/(travellog)`, `app/(homelog)`, `app/(sociallog)`, `app/(shoppinglog)`,
`app/(learnlog)`.
Route groups don't appear in the URL, so each app owns its own top-level path
namespace (`/moneylog`, `/tasklog`, `/burnlog`, ...) — no two apps' routes
overlap. BurnLog's routes were namespaced under `/burnlog` last; a handful of
bare legacy paths (`/dashboard`, `/ai-setup`) are kept as redirect-only stubs
for old links, aliasing to `/logbook` and `/burnlog/ai-setup` respectively.

Each group has its own `layout.tsx` (theming, nav) and its own bottom-nav
component (`BottomNav.tsx` for BurnLog, `LogbookBottomNav.tsx`,
`MoneyLogBottomNav.tsx`, `TaskLogBottomNav.tsx`, `TravelLogBottomNav.tsx`,
`HomeLogBottomNav.tsx`, `SocialLogBottomNav.tsx`, `ShoppingLogBottomNav.tsx`,
`LearnLogBottomNav.tsx`).

### Shared identity, per-app config

Login, signup, and profile (`app/login`, `app/signup`, `app/profile`) are
**not** namespaced to any one app — a user has exactly one account, one
avatar/name/username, and one default-app preference, all managed from
`/profile` (LogBook-scoped only). Each sub-app instead gets its own
**Config** page (`/<app>/config`) for app-specific settings — health metrics
live in BurnLog's config, budget categories in MoneyLog's, and so on. See
`docs/superpowers/specs/2026-08-31-identity-consolidation-design.md` for why
this split exists.

`lib/appMode.ts` defines the `APPS` registry (id, display name, tagline, home
route) that the app switcher, default-app picker, and per-app theming all
read from.

### Auth & routing

`middleware.ts` gates every route except `/login`, `/signup`, and
`/signup/profile` behind Supabase auth, and redirects authenticated users
without a `profiles` row to profile setup. Post-login/signup, users land on
`/logbook`.

### Data

Postgres via Supabase, accessed through Prisma (`prisma/schema.prisma`) for
most models and the Supabase JS client directly for auth/session. Each
sub-app owns a distinct slice of the schema (`Workout`/`FitnessGoal`/... for
BurnLog, `FinanceTransaction`/`FinancialGoal`/... for MoneyLog,
`Household*` for HomeLog, `Social*` for SocialLog, `Shop*` for ShoppingLog,
`Task`/`TaskGoal`/`MydayBlock`/`Idea` for TaskLog/LogBook) plus one shared
`Profile` model for identity.

### PWA & mobile

The app is a installable PWA (`next-pwa`, service worker, push
notifications — see `PWA_README.md`) and is also wrapped for native iOS/
Android via Capacitor (`ios/`, `android/`, `capacitor.config.ts`).

## Tech stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4, shadcn/ui, Radix primitives, `motion`
- **Backend:** Next.js API routes, Supabase (Postgres + Auth), Prisma ORM
- **Charts:** Recharts
- **AI:** OpenAI API (onboarding assistants, insights)
- **PWA:** next-pwa, Workbox, Web Push
- **Mobile:** Capacitor (iOS/Android)

## Getting started

### Prerequisites

- Node.js 18+
- A Supabase project

### Setup

```bash
git clone <repo-url>
cd burnlog
npm install
```

Create a `.env` file (see `.env.example`) with your Supabase and database
credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_database_url
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll land on
`/login`, then `/logbook` after signing up.

### Useful scripts

```bash
npm run dev              # dev server (Turbopack)
npm run build             # production build
npm run lint               # eslint
npm run seed:sociallog     # seed SocialLog sample data
npm run seed:shoppinglog   # seed ShoppingLog sample data
npm run cap:sync           # sync web build into iOS/Android shells
npm run cap:open:ios       # open Xcode project
npm run cap:open:android   # open Android Studio project
```

## Project structure

```
app/
  (logbook)/logbook/     LogBook hub — see app/(logbook)/README.md
  (burnlog)/             BurnLog — see app/(burnlog)/README.md
  (moneylog)/moneylog/   MoneyLog — see app/(moneylog)/README.md
  (tasklog)/tasklog/     TaskLog — see app/(tasklog)/README.md
  (travellog)/travellog/ TravelLog — see app/(travellog)/README.md
  (homelog)/homelog/     HomeLog — see app/(homelog)/README.md
  (sociallog)/sociallog/ SocialLog — see app/(sociallog)/README.md
  (shoppinglog)/shoppinglog/ ShoppingLog — see app/(shoppinglog)/README.md
  (learnlog)/learnlog/   LearnLog — see app/(learnlog)/README.md
  login/, signup/, profile/  Shared auth & identity (not app-scoped)
  api/                    API routes, one subtree per app
components/               Shared UI + per-app nav/menu components
lib/                      Shared utilities + one dir per app (lib/homelog, lib/sociallog, ...)
prisma/schema.prisma      Full data model, one section per app
docs/superpowers/         Design specs & plans for past and in-flight work
```

## Further reading

- Per-app docs linked in the table above
- `docs/superpowers/specs/` — design specs for major features (identity
  consolidation, onboarding, per-app foundations, etc.)
- `PWA_README.md` — PWA/service-worker/push-notification details
