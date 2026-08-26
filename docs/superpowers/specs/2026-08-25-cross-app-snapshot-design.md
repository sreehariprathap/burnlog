# Cross-App Snapshot — Design

**Date:** 2026-08-25
**Status:** Approved design, pending spec review

## Goal

Give each app (BurnLog, LifeLog, TaskLog) a small, read-only glance at what's happening in the other two, surfaced on each app's dashboard. The goal is awareness and a one-tap shortcut between apps — not data merging or automation.

## Non-Goals

- No automated cross-app writes (e.g. a missed BurnLog streak auto-creating a TaskLog task). That's a possible future follow-up, explicitly deferred.
- No new database tables. All signals are computed from existing tables (`profiles`, `finance_transactions`, `recurring_items`, `tasklog_tasks`).
- No historical trends or charts — one current-state number per source app.

## Decisions (locked during brainstorming)

1. **Direction:** read-only context only, no automated task/goal creation.
2. **Scope:** bidirectional — every app's dashboard shows a snippet from the other two.
3. **Signals:**
   - BurnLog contributes: current workout streak (`profiles.currentStreak`).
   - LifeLog contributes: this week's net (income − expense), computed the same way LifeLog's own dashboard computes it (real transactions + expanded recurring items for the current week).
   - TaskLog contributes: count of open tasks due/planned for today, plus its own streak (`profiles.taskLogCurrentStreak`).
4. **Interaction:** each stat chip is tappable and calls the existing `useAppSwitch().switchTo(app)` to jump straight into that app — same mechanism the AppSwitcher sheet uses.
5. **Zero-state handling:** a chip hides itself if its underlying signal is unavailable/meaningless (e.g. a LifeLog user with zero transactions ever) rather than showing a misleading zero.

## Architecture

### Data layer — `lib/crossApp/snapshot.ts`

```ts
export interface CrossAppSnapshot {
  burnlogStreak: number | null;       // null = no signal yet (never logged a session)
  lifelogWeeklyNet: number | null;    // null = no transactions/recurring items ever
  tasklogStreak: number | null;       // null = no signal yet
  tasklogDueToday: number;            // always a number (0 is meaningful: "clear")
}

export async function getCrossAppSnapshot(
  supabase: SupabaseClient,
  profileId: string
): Promise<CrossAppSnapshot>
```

One function, called by all three dashboards with the same `profileId` — each dashboard just picks the two fields it needs and ignores its own app's field.

- **BurnLog/TaskLog streaks:** a single `profiles` query for `currentStreak, taskLogCurrentStreak`. `null` if the value is `0` **and** the user has no BurnLog session/TaskLog task history at all (distinguishes "never used this app" from "streak legitimately at 0 today") — checked via a lightweight existence query (`select id limit 1`) only when the streak value is 0, to avoid extra queries for active users.
- **LifeLog weekly net:** reuses `getPeriodRange('weekly')` and `expandRecurringInRange` from `lib/financePeriods.ts` — the exact function LifeLog's own dashboard (`useFinanceData`) uses — combined with a `finance_transactions` query for the current week. `null` if both the transactions and recurring-items queries return empty (never used LifeLog).
- **TaskLog due-today count:** `tasklog_tasks` where `profileId` matches, `completedAt is null`, and (`dueDate = today` or `plannedForToday = true`). Always a number, since "0 due today" is itself useful information for BurnLog/LifeLog users glancing over.

### Widget — `components/CrossAppSnapshot.tsx`

```tsx
interface CrossAppSnapshotProps {
  currentApp: AppId;
  profileId: string;
}
```

- Fetches via `getCrossAppSnapshot` on mount (own `createClientComponentClient()`, no props drilling from the parent dashboard beyond `profileId`).
- Renders a single `Card` containing up to 2 stat chips — whichever two apps are *not* `currentApp`. Each chip: small icon (reuse `TaskLogMark`/`LifeLogMark`/a plain "B" for BurnLog, matching the switcher's existing icon logic), a short label ("3-day streak", "+$120 this week", "2 due today"), tap target calling `useAppSwitch().switchTo(otherAppId)`.
- If both target apps are in a null/zero-signal state, the whole card renders nothing (returns `null`) rather than an empty shell.
- Skeleton (`Skeleton` from `components/ui/skeleton`) while the fetch is in flight.

### Placement (one line per file, three files)

- `app/(burnlog)/dashboard/page.tsx`: `<CrossAppSnapshot currentApp="burnlog" profileId={userProfile.id} />` right after the Welcome Card, guarded by `{userProfile && ...}` (mirrors the existing `ConsistencyTracker` guard immediately below it).
- `app/(lifelog)/lifelog/page.tsx`: same component after `<TopBar title="LifeLog" />`, guarded by `{profileId && ...}`.
- `app/(tasklog)/tasklog/page.tsx`: same component after the existing streak/stat row, guarded by `{profile && ...}`.

No other files change. No new tables, no RLS changes (all queries are already-permitted owner-scoped reads on existing tables).

## Error handling

- Any of the three underlying queries failing independently should not blank the whole widget — `getCrossAppSnapshot` catches per-query errors and falls back to `null`/`0` for that specific field, same fail-soft posture as the rest of the app's AI/data fetches.

## Testing

Manual: log in, visit each of the three dashboards, confirm the other two apps' stats render (or the card hides itself for a brand-new profile with no LifeLog activity), tap a chip and confirm it switches apps and lands on that app's home route.
