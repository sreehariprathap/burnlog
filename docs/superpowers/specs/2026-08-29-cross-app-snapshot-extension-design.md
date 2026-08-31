# Cross-App Snapshot Extension — Design

**Date:** 2026-08-29
**Status:** Approved design, implementing directly per explicit user direction
**Parent effort:** Second of six planned "connect the apps" integrations. Extends the existing read-only widget from `2026-08-25-cross-app-snapshot-design.md` (originally BurnLog/LifeLog/TaskLog only) to cover all six apps now that HomeLog, SocialLog, and ShoppingLog exist.

## Goal

Give HomeLog, SocialLog, and ShoppingLog the same one-tap cross-app awareness that BurnLog, MoneyLog, and TaskLog already have, and update those three existing dashboards so their widget also surfaces the three new apps.

## Non-Goals

- No automated cross-app writes — still read-only, same as the original design.
- No new database tables — all three new signals are computed from existing tables (`household_chore_instances`, `household_members`, `social_messages`, `shop_cart_items`).
- No historical trends — one current-state number per app, same as today.
- No re-litigating the original three signals (BurnLog streak, MoneyLog weekly net, TaskLog due-today/streak) — unchanged.

## Decisions (locked during brainstorming)

1. **Scope:** fully bidirectional across all six apps — every dashboard shows a chip for every *other* app that has a signal.
2. **New signals:**
   - HomeLog contributes: count of household chores due today (`household_chore_instances` where `dueDate = today`, `completedAt is null`, scoped to the profile's household via `household_members`). Always a number — `0` (no household, or a household with nothing due) is meaningful, mirrors TaskLog's `tasklogDueToday`.
   - SocialLog contributes: unread DM count (`social_messages` where the profile is a thread participant, `senderId != profileId`, `readAt is null`). `null` if the profile has never sent or received a message, ever — otherwise a number, including `0`.
   - ShoppingLog contributes: cart item count (`shop_cart_items` for the profile). `null` if the profile has never added anything to a cart, ever (checked via existence query only when the live count is `0`, same lazy pattern as the BurnLog/TaskLog streak fields) — otherwise a number.
3. **Layout:** up to 5 chips can now appear on one dashboard. The card switches from a single non-wrapping flex row to a wrapping flex row, and chips drop their `flex-1` sizing in favor of a natural width, so they wrap onto 2–3 rows instead of being squeezed.
4. **Icons:** new chips use plain `lucide-react` icons tinted to each app's existing theme hue (`HomeIcon`, `MessageCircleIcon`, `ShoppingCartIcon`), matching the convention of the three existing chips (`FlameIcon`, `WalletIcon`, `ListChecksIcon`) — not the brand `*Mark` SVG components, which stay reserved for `TopBar`/`AppSwitcher`.
5. **Profile access on the three new host pages:** all three (`app/(homelog)/homelog/page.tsx`, `app/(sociallog)/sociallog/page.tsx`, `app/(shoppinglog)/shoppinglog/page.tsx`) are client components. They use `useCurrentProfile()` (`lib/useCurrentProfile.ts`) to get `profile.id`, the same hook the three existing host pages (`app/(burnlog)/dashboard/page.tsx`, `app/(moneylog)/moneylog/page.tsx`, `app/(tasklog)/tasklog/page.tsx`) already use for this exact purpose — not new server-side prop plumbing.
6. **Error handling:** unchanged posture — each new resolver function is wrapped the same way the existing three are (`.catch(() => null)` or `.catch(() => 0)` inside the `Promise.all` in `getCrossAppSnapshot`), so one app's query failing never blanks the whole widget.

## Architecture

### `lib/crossApp/snapshot.ts`

Extend the `CrossAppSnapshot` interface and add three resolver functions, following the exact shape of the existing ones:

```ts
export interface CrossAppSnapshot {
  burnlogStreak: number | null;
  moneylogWeeklyNet: number | null;
  tasklogStreak: number | null;
  tasklogDueToday: number;
  homelogChoresDueToday: number;
  sociallogUnreadCount: number | null;
  shoppinglogCartCount: number | null;
}
```

**`resolveHomelogChoresDueToday`** — look up the profile's `household_members` row for its `householdId` (if none, return `0` immediately — no household means nothing can be due). Then count `household_chore_instances` joined through `household_chores.householdId = householdId`, filtered to `dueDate = today` and `completedAt is null`. Same `todayDateString()` helper `resolveTasklogDueToday` already imports from `lib/tasklog/types`.

**`resolveSociallogUnreadCount`** — count `social_messages` where `senderId != profileId`, `readAt is null`, and the message's `threadId` belongs to a thread where the profile is `participantAId` or `participantBId`. If the count is `0`, fall back to an existence check across all messages ever sent-or-received by the profile (same lazy-null pattern as `resolveBurnlogStreak`/`resolveTasklogStreak`) to distinguish "never used SocialLog" from "caught up."

**`resolveShoppinglogCartCount`** — count `shop_cart_items` for the profile. If `0`, existence-check the profile's full `shop_cart_items` history (there's no separate "cart items ever added" signal to check, since cart items get deleted on checkout — so this resolver instead checks whether the profile has ever placed a `ShopOrder` as buyer OR has any current cart items; if neither, `null`).

Wire all three into the `Promise.all` in `getCrossAppSnapshot`, each `.catch()`-guarded like the existing four.

### `components/CrossAppSnapshot.tsx`

- Add three more `if` blocks to `buildChips`, one per new app, each gated by `currentApp !== 'X'` and a non-null/non-zero-when-meaningful check, matching the existing three blocks' structure exactly.
- Icons: `HomeIcon` (rose/homelog hue), `MessageCircleIcon` (sociallog hue), `ShoppingCartIcon` (`text-[#f18701]`, ShoppingLog's exact theme color, since it's a one-off hex rather than a Tailwind-named color like the other five).
- Labels: `"{n} chores due"`, `"{n} unread"`, `"{n} in cart"` — terse, matching the existing `"{n} due today"` style.
- `CardContent` changes from `flex items-center gap-2 p-3` to `flex flex-wrap items-center gap-2 p-3`; each chip button drops `flex-1` (keeping `gap-2` and its existing padding/border/hover styles) so it sizes to its content and wraps naturally instead of stretching to fill a single row.

### Placement (one line per file, three new files)

- `app/(homelog)/homelog/page.tsx`: add `useCurrentProfile()` (not currently imported there) and render `<CrossAppSnapshot currentApp="homelog" profileId={profile.id} />` guarded by `{profile && ...}`, placed right after `<TopBar title="HomeLog" />` — matching where the existing three host pages place it relative to their own `TopBar`.
- `app/(sociallog)/sociallog/page.tsx`: same, `currentApp="sociallog"`, after its `<TopBar title="SocialLog" />`.
- `app/(shoppinglog)/shoppinglog/page.tsx`: same, `currentApp="shoppinglog"`, after its `<TopBar title="ShoppingLog" ... />`.

No changes needed to the three existing host pages (`burnlog`/`moneylog`/`tasklog`) beyond what `buildChips` already does automatically — they already render `<CrossAppSnapshot>`, and the new chips appear there for free once `buildChips` knows about the new apps.

## Testing

Manual, same posture as the original cross-app snapshot design (no automated tests exist for this widget):

1. Log in as a profile with a household with a chore due today, unread SocialLog messages, and items in a ShoppingLog cart. Visit BurnLog's dashboard — confirm chips for MoneyLog, TaskLog, HomeLog, SocialLog, and ShoppingLog all render (BurnLog's own chip is absent, since `currentApp === 'burnlog'`), and the row wraps rather than squeezing.
2. Tap the new HomeLog chip from BurnLog's dashboard — confirm it switches to HomeLog via `useAppSwitch().switchTo('homelog')`.
3. Visit HomeLog's own dashboard — confirm the widget renders there too, showing chips for the other five apps and omitting HomeLog's own.
4. For a brand-new profile with zero household/SocialLog/ShoppingLog activity, confirm those three chips are absent (not shown as `0`), matching the null-hiding behavior of the existing BurnLog/MoneyLog chips.
