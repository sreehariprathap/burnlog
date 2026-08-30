# Cross-App Snapshot Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing read-only `CrossAppSnapshot` widget (currently BurnLog/MoneyLog/TaskLog only) to also cover HomeLog, SocialLog, and ShoppingLog — both as new signal sources and as new host pages that render the widget.

**Architecture:** Three new resolver functions and three new fields on `lib/crossApp/snapshot.ts`'s `CrossAppSnapshot` interface, following the exact pattern of the four existing resolvers. `components/CrossAppSnapshot.tsx`'s `buildChips` gets three more `if` blocks plus a layout tweak (wrap instead of squeeze). Three host pages (`homelog`, `sociallog`, `shoppinglog`) each get a one-line `<CrossAppSnapshot>` render, matching how the three existing host pages already do it.

**Tech Stack:** Next.js client components, `@supabase/supabase-js` query builder (via `SupabaseClient` passed into `getCrossAppSnapshot`), SWR-free — this widget does its own `useEffect` fetch, no changes needed there.

## Global Constraints

- `homelogChoresDueToday`: always a number, never `null` — `0` is meaningful ("nothing due" or "no household"). Matches `tasklogDueToday`'s existing convention.
- `sociallogUnreadCount`: `null` only if the profile has never sent or received a `social_messages` row, ever; otherwise a number including `0`.
- `shoppinglogCartCount`: `null` only if the profile has never had a cart item AND never placed a `ShopOrder` as buyer; otherwise a number including `0`.
- Every new resolver call in `getCrossAppSnapshot`'s `Promise.all` must be `.catch()`-guarded the same way the four existing ones are — one app's query failing must never blank the whole widget.
- New chip icons: `lucide-react` icons tinted with a Tailwind text-color class (or `text-[#f18701]` for ShoppingLog specifically, since that's the app's literal hex, not a named Tailwind color) — never the brand `*Mark` SVG components.
- `CardContent`'s chip row must wrap (`flex-wrap`) and chips must size to content (no `flex-1`) once there can be up to 5 chips.
- Full design spec: `docs/superpowers/specs/2026-08-29-cross-app-snapshot-extension-design.md`

---

### Task 1: Add the three new resolvers and fields to `lib/crossApp/snapshot.ts`

**Files:**
- Modify: `lib/crossApp/snapshot.ts`

**Interfaces:**
- Produces: `CrossAppSnapshot` interface gains `homelogChoresDueToday: number`, `sociallogUnreadCount: number | null`, `shoppinglogCartCount: number | null`. `getCrossAppSnapshot` returns these three new fields alongside the four existing ones. Task 2 (the widget) consumes exactly these three field names — do not rename them.

- [ ] **Step 1: Add the three resolver functions**

In `lib/crossApp/snapshot.ts`, add these three functions after the existing `resolveTasklogDueToday` function (before `getCrossAppSnapshot`):

```ts
async function resolveHomelogChoresDueToday(supabase: SupabaseClient, profileId: string): Promise<number> {
  const { data: membership } = await supabase
    .from('household_members')
    .select('householdId')
    .eq('profileId', profileId)
    .maybeSingle();
  if (!membership) return 0;

  const today = todayDateString();
  const { data: chores } = await supabase
    .from('household_chores')
    .select('id')
    .eq('householdId', membership.householdId);
  const choreIds = (chores ?? []).map((c) => c.id);
  if (choreIds.length === 0) return 0;

  const { count } = await supabase
    .from('household_chore_instances')
    .select('id', { count: 'exact', head: true })
    .in('choreId', choreIds)
    .eq('dueDate', today)
    .is('completedAt', null);
  return count ?? 0;
}

async function resolveSociallogUnreadCount(supabase: SupabaseClient, profileId: string): Promise<number | null> {
  const { data: threads } = await supabase
    .from('social_message_threads')
    .select('id')
    .or(`participantAId.eq.${profileId},participantBId.eq.${profileId}`);
  const threadIds = (threads ?? []).map((t) => t.id);
  if (threadIds.length === 0) return null;

  const { count } = await supabase
    .from('social_messages')
    .select('id', { count: 'exact', head: true })
    .in('threadId', threadIds)
    .neq('senderId', profileId)
    .is('readAt', null);
  return count ?? 0;
}

async function resolveShoppinglogCartCount(supabase: SupabaseClient, profileId: string): Promise<number | null> {
  const { count: cartCount } = await supabase
    .from('shop_cart_items')
    .select('id', { count: 'exact', head: true })
    .eq('profileId', profileId);
  if (cartCount && cartCount > 0) return cartCount;

  const { count: everOrdered } = await supabase
    .from('shop_orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyerId', profileId);
  return everOrdered && everOrdered > 0 ? 0 : null;
}
```

- [ ] **Step 2: Extend the interface and wire the resolvers into `getCrossAppSnapshot`**

Update the `CrossAppSnapshot` interface:

```ts
export interface CrossAppSnapshot {
  burnlogStreak: number | null; // null = no BurnLog usage signal at all
  moneylogWeeklyNet: number | null; // null = no MoneyLog usage signal at all
  tasklogStreak: number | null; // null = no TaskLog usage signal at all
  tasklogDueToday: number; // always a number — "0 due today" is meaningful
  homelogChoresDueToday: number; // always a number — "0 due today" (or no household) is meaningful
  sociallogUnreadCount: number | null; // null = never sent/received a message
  shoppinglogCartCount: number | null; // null = never added a cart item or placed an order
}
```

Update `getCrossAppSnapshot`:

```ts
export async function getCrossAppSnapshot(supabase: SupabaseClient, profileId: string): Promise<CrossAppSnapshot> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('currentStreak, taskLogCurrentStreak')
    .eq('id', profileId)
    .single();

  const [
    burnlogStreak,
    tasklogStreak,
    moneylogWeeklyNet,
    tasklogDueToday,
    homelogChoresDueToday,
    sociallogUnreadCount,
    shoppinglogCartCount,
  ] = await Promise.all([
    resolveBurnlogStreak(supabase, profileId, profileRow?.currentStreak ?? 0).catch(() => null),
    resolveTasklogStreak(supabase, profileId, profileRow?.taskLogCurrentStreak ?? 0).catch(() => null),
    resolveMoneylogWeeklyNet(supabase, profileId).catch(() => null),
    resolveTasklogDueToday(supabase, profileId).catch(() => 0),
    resolveHomelogChoresDueToday(supabase, profileId).catch(() => 0),
    resolveSociallogUnreadCount(supabase, profileId).catch(() => null),
    resolveShoppinglogCartCount(supabase, profileId).catch(() => null),
  ]);

  return {
    burnlogStreak,
    moneylogWeeklyNet,
    tasklogStreak,
    tasklogDueToday,
    homelogChoresDueToday,
    sociallogUnreadCount,
    shoppinglogCartCount,
  };
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/crossApp/snapshot.ts
git commit -m "feat(crossapp): add HomeLog/SocialLog/ShoppingLog signals to snapshot"
```

---

### Task 2: Render the three new chips and fix the layout for up to 5 chips

**Files:**
- Modify: `components/CrossAppSnapshot.tsx`

**Interfaces:**
- Consumes: `homelogChoresDueToday: number`, `sociallogUnreadCount: number | null`, `shoppinglogCartCount: number | null` from `SnapshotData` (Task 1).
- Produces: nothing consumed by other tasks — this is the last file that reads the new snapshot fields.

- [ ] **Step 1: Add three lucide icon imports**

In `components/CrossAppSnapshot.tsx`, update the icon import line:

```ts
import { FlameIcon, ListChecksIcon, WalletIcon, HomeIcon, MessageCircleIcon, ShoppingCartIcon } from 'lucide-react';
```

- [ ] **Step 2: Add three chip blocks to `buildChips`**

Add these three `if` blocks inside `buildChips`, after the existing `tasklog` block and before the `return chips;` line:

```ts
  if (currentApp !== 'homelog' && data.homelogChoresDueToday > 0) {
    chips.push({
      app: 'homelog',
      icon: <HomeIcon className="h-4 w-4 text-purple-500" />,
      label: `${data.homelogChoresDueToday} chores due`,
    });
  }

  if (currentApp !== 'sociallog' && data.sociallogUnreadCount !== null) {
    chips.push({
      app: 'sociallog',
      icon: <MessageCircleIcon className="h-4 w-4 text-pink-500" />,
      label: `${data.sociallogUnreadCount} unread`,
    });
  }

  if (currentApp !== 'shoppinglog' && data.shoppinglogCartCount !== null) {
    chips.push({
      app: 'shoppinglog',
      icon: <ShoppingCartIcon className="h-4 w-4 text-[#f18701]" />,
      label: `${data.shoppinglogCartCount} in cart`,
    });
  }
```

Note `homelogChoresDueToday` is gated on `> 0` (not `!== null`, since it's always a number) — a household with nothing due today is not worth a chip, matching how `tasklogDueToday` is folded into the existing tasklog block's `|| data.tasklogDueToday > 0` condition rather than shown unconditionally.

- [ ] **Step 3: Fix the chip row layout to wrap**

In the same file's JSX, change:

```tsx
      <CardContent className="flex items-center gap-2 p-3">
```

to:

```tsx
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
```

And change the chip `<button>`'s className from:

```tsx
            className="flex flex-1 items-center gap-2 rounded-md border p-2 text-left transition-colors hover:bg-accent"
```

to:

```tsx
            className="flex items-center gap-2 rounded-md border p-2 text-left transition-colors hover:bg-accent"
```

(Just dropping `flex-1` — everything else about the button stays the same.)

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/CrossAppSnapshot.tsx
git commit -m "feat(crossapp): render HomeLog/SocialLog/ShoppingLog chips, wrap the row"
```

---

### Task 3: Render the widget on the three new host pages

**Files:**
- Modify: `app/(homelog)/homelog/page.tsx`
- Modify: `app/(sociallog)/sociallog/page.tsx`
- Modify: `app/(shoppinglog)/shoppinglog/page.tsx`

**Interfaces:**
- Consumes: `CrossAppSnapshot` component from `@/components/CrossAppSnapshot` (props: `currentApp: AppId`, `profileId: string`) and `useCurrentProfile` from `@/lib/useCurrentProfile` (returns `{ profile, loading, error }`, where `profile.id` is the profile's UUID).
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: `app/(homelog)/homelog/page.tsx`**

This file does not currently import `useCurrentProfile` or `CrossAppSnapshot`. Add both imports near the top (alongside the existing `useHouseholdMe` import):

```ts
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';
```

Inside `HomeLogPage`, add a call to the hook near the top of the component body (alongside the existing `useHouseholdMe()` call):

```ts
  const { profile } = useCurrentProfile();
```

Then, immediately after `<TopBar title="HomeLog" />` (line 125), add:

```tsx
      {profile && <CrossAppSnapshot currentApp="homelog" profileId={profile.id} />}
```

- [ ] **Step 2: `app/(sociallog)/sociallog/page.tsx`**

`useCurrentProfile` is already imported and called here (`const { profile } = useCurrentProfile();`). Add one import:

```ts
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';
```

Then, immediately after `<TopBar title="SocialLog" />`, add:

```tsx
        {profile && <CrossAppSnapshot currentApp="sociallog" profileId={profile.id} />}
```

- [ ] **Step 3: `app/(shoppinglog)/shoppinglog/page.tsx`**

This file does not currently import `useCurrentProfile` or `CrossAppSnapshot`. Add both:

```ts
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { CrossAppSnapshot } from '@/components/CrossAppSnapshot';
```

Inside `ShoppingLogBrowsePage`, add near the top of the component body:

```ts
  const { profile } = useCurrentProfile();
```

Then, immediately after the closing `/>` of the `<TopBar ... />` block (the one with the `actions` prop containing the Favorites link), add:

```tsx
      {profile && <CrossAppSnapshot currentApp="shoppinglog" profileId={profile.id} />}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, then in the browser:
1. As a profile with some cross-app activity (a household with a chore due today, an unread SocialLog message, an item in a ShoppingLog cart), visit HomeLog, SocialLog, and ShoppingLog in turn. Confirm the snapshot widget renders on each, showing chips for the other five apps (never a chip for the app you're currently on), and that the row wraps rather than squeezing chips into one line.
2. Tap a chip from one of the three new pages and confirm it switches apps via `useAppSwitch().switchTo(...)`.
3. Revisit BurnLog/MoneyLog/TaskLog and confirm they now also show chips for HomeLog/SocialLog/ShoppingLog (in addition to their pre-existing chips), still wrapping correctly.
4. For a profile with zero household/SocialLog/ShoppingLog history, confirm those three chips are absent everywhere (not shown as "0"), while the "chores due" chip for a profile that *has* a household but nothing due today is also absent (per Task 2 Step 2's `> 0` gate).

- [ ] **Step 6: Commit**

```bash
git add "app/(homelog)/homelog/page.tsx" "app/(sociallog)/sociallog/page.tsx" "app/(shoppinglog)/shoppinglog/page.tsx"
git commit -m "feat(crossapp): render snapshot widget on HomeLog/SocialLog/ShoppingLog"
```
