# Goals Page Icon Tab Bar — Design

## Problem

The Goals page (`app/goals/page.tsx`) presents six sections — Goals, Weight,
Calories, Food, Stamina, Meal Plan — as swipeable slides in `MotionCarousel`
(embla-carousel). The only navigation affordance is a row of dot indicators
below the carousel; there is no indication of what the other slides contain,
so a user has to swipe blind to discover them.

## Goal

Add a tab bar above the carousel that (a) shows all six sections at a glance
via icons, (b) lets the user tap a tab to jump directly to that section, and
(c) stays in sync with swiping — tapping and swiping both update the same
selection state. Inspired by kokonutui's "smooth tab" component
(https://kokonutui.com/docs/navigation/smooth-tab): a sliding colored pill
animates behind the active tab.

## Non-goals

- No text labels on tabs (icon-only, per user decision) — labels are
  accessible via `aria-label` only.
- No change to the six sections' own content/behavior.
- No change to `MotionCarousel`'s use elsewhere (it currently has no other
  call sites, but the component itself stays generic/reusable — see
  Architecture).

## Architecture

Two components compose at the call site (`app/goals/page.tsx`), each with a
single clear responsibility:

1. **`SmoothTabs`** (new — `components/kokonutui/smooth-tabs.tsx`): a
   generic, controlled icon-tab bar. Knows nothing about goals/carousels —
   just renders `items`, highlights `selectedIndex`, calls `onSelect(index)`
   on tap.
2. **`MotionCarousel`** (existing — `components/kokonutui/motion-carousel.tsx`):
   gains a controlled mode. Currently owns `selectedIndex` internally
   (embla `selectedScrollSnap()`); it will accept optional
   `selectedIndex`/`onSelect` props so a parent can both observe and drive
   the active slide, while remaining fully backward compatible for any
   future uncontrolled usage (props optional, internal state used as
   fallback when not provided).
3. **`GoalsPage`** lifts `selectedIndex` state and passes it to both:
   tapping a `SmoothTabs` icon calls `emblaApi.scrollTo(index)` (via
   `MotionCarousel`'s controlled prop), and swiping updates the same
   `selectedIndex` state, which re-renders `SmoothTabs`' active pill.

### `SmoothTabs` component

```
type TabItem = {
  id: string;
  icon: LucideIcon;
  label: string;   // aria-label only, not rendered
  color: string;    // CSS color value, e.g. "var(--chart-1)"
};

function SmoothTabs({
  items,
  selectedIndex,
  onSelect,
  className,
}: {
  items: TabItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}): JSX.Element
```

- Renders a horizontally-scrollable (`overflow-x-auto`) row of icon buttons.
  Scrolling is a fallback for narrow screens; with 6 compact icon buttons it
  should not usually be needed on typical phone widths, but the row must not
  wrap or clip.
- The active tab's colored pill background is a `motion.span` with a shared
  `layoutId="smooth-tabs-pill"`, animated via Framer Motion's layout
  animation (`transition={{ type: "spring", stiffness: 400, damping: 30 }}`)
  — when `selectedIndex` changes, the previously-active button's pill
  element unmounts and the newly-active one mounts with the same
  `layoutId`, so Framer Motion animates the shared element between their
  positions automatically. This achieves the same visual result as
  kokonutui's manual ref-measurement approach with substantially less code.
- Active tab: icon color `white`/`text-white`, pill `backgroundColor: item.color`.
  Inactive tab: `text-muted-foreground`, transparent background, subtle hover state.
- Each button has `aria-label={item.label}` and `aria-current={isActive}`.

### `MotionCarousel` controlled-mode change

Add optional props:

```
selectedIndex?: number;
onSelect?: (index: number) => void;
```

- If `selectedIndex` is provided and differs from embla's current
  `selectedScrollSnap()`, call `emblaApi.scrollTo(selectedIndex)` in an
  effect.
- The existing internal `onSelect` handler (embla's "select" event) continues
  to update local state for animation purposes (slide scale/opacity) AND
  additionally invokes the new `onSelect` prop, if provided, so the parent
  learns about swipe-driven changes.
- The existing bottom dot indicators are removed from `MotionCarousel`
  entirely — `SmoothTabs` is now the position indicator and jump control.
  (If `MotionCarousel` ever gains another call site that wants dots instead
  of external tabs, that's a future prop like `showDots`, not built now —
  YAGNI.)

### Placement in `GoalsPage`

```
<TopBar title="Fitness Goals" />
<div className="sticky top-14 z-10 -mx-4 border-b bg-background/80 px-4 py-2 backdrop-blur">
  <SmoothTabs items={goalTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
</div>
<div className="px-4 py-2 flex flex-col gap-2">
  <MotionCarousel
    selectedIndex={selectedIndex}
    onSelect={setSelectedIndex}
    slides={[...]}
  />
</div>
```

`top-14` (56px) approximates `TopBar`'s rendered height (20px logo + 16px×2
padding); exact value will be verified visually during implementation and
adjusted if there's a gap/overlap.

### Tab items and colors

| Section    | Icon (lucide-react) | Color token   |
|------------|----------------------|---------------|
| Goals      | `Target`             | `var(--chart-1)` |
| Weight     | `Scale`               | `var(--chart-2)` |
| Calories   | `Flame`                | `var(--chart-3)` |
| Food       | `Utensils`             | `var(--chart-4)` |
| Stamina    | `HeartPulse`           | `var(--chart-5)` |
| Meal Plan  | `CalendarCheck`        | `var(--chart-1)` (reused, 6th item wraps back to the first token) |

These are the same theme-token colors already used for the redesigned
Workout Distribution chart — multi-color per tab (per user's explicit
preference) without introducing new arbitrary/off-brand hues.

## Data flow

No new data fetching. `selectedIndex` is pure UI state (`useState<number>(0)`)
in `GoalsPage`, initialized to 0 (the Goals slide). No persistence across
page loads — always opens on the Goals tab, matching current carousel
behavior (embla defaults to the first slide).

## Error handling

None needed — this is a pure client-side navigation/UI change with no new
async operations, network calls, or failure modes beyond what `MotionCarousel`
and its slide contents already handle.

## Testing

No automated test framework in this repo (project-wide constraint).
Verification is manual:
- `npx tsc --noEmit`
- Browser check (Chrome DevTools MCP): tap each tab, confirm the carousel
  jumps to the matching slide and the pill slides to that tab; swipe the
  carousel and confirm the tab bar's active pill updates to match; confirm
  the tab bar stays pinned while scrolling down within a tall section
  (e.g. WeightTracker); check both light and dark mode.

## Open questions

None — all decisions confirmed with the user during brainstorming.
