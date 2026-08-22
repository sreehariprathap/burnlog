# Goals Page Icon Tab Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky, icon-only tab bar above the Goals page's swipeable carousel so users can see and jump directly to any of the six sections (Goals, Weight, Calories, Food, Stamina, Meal Plan) instead of discovering them by blind swiping.

**Architecture:** A new generic `SmoothTabs` component (icon pills with a Framer-Motion `layoutId`-animated sliding colored background) is composed with the existing `MotionCarousel`, which gains optional controlled-mode props (`selectedIndex`/`onSelect`) so tapping a tab and swiping the carousel both drive the same state. `GoalsPage` lifts `selectedIndex` and wires both components together; the carousel's old dot indicators are removed since the tab bar now serves that purpose.

**Tech Stack:** Next.js (client components), `motion/react` (already a dependency, used by `MotionCarousel`), `embla-carousel-react` (already used by `MotionCarousel`), `lucide-react` icons, Tailwind CSS.

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing via Chrome DevTools MCP (`http://127.0.0.1:3000`, test account `push-verify@example.com` / `PushVerify123!`).
- Tabs are icon-only — no visible text labels. Each `TabItem.label` is used only for `aria-label`/`aria-current`, never rendered as visible text.
- Tab colors come from the existing theme tokens `var(--chart-1)` through `var(--chart-5)` (already defined in `app/globals.css`, dark-mode aware). There are 6 tabs and 5 tokens — the 6th tab (Meal Plan) reuses `var(--chart-1)`.
- `MotionCarousel`'s new `selectedIndex`/`onSelect` props must be optional and backward-compatible — the component must still work correctly if rendered with only `slides` (uncontrolled), since that's how it's used today.
- `MotionCarousel`'s existing dot-indicator row is removed entirely (not hidden behind a flag) — the tab bar replaces it as the position indicator and jump control.

---

### Task 1: `SmoothTabs` component + `MotionCarousel` controlled mode

**Files:**
- Create: `components/kokonutui/smooth-tabs.tsx`
- Modify: `components/kokonutui/motion-carousel.tsx`

**Interfaces:**
- Produces: `SmoothTabs({ items, selectedIndex, onSelect, className }: SmoothTabsProps)` where `SmoothTabsProps = { items: TabItem[]; selectedIndex: number; onSelect: (index: number) => void; className?: string }` and `TabItem = { id: string; icon: LucideIcon; label: string; color: string }`. Both `SmoothTabs` and `TabItem` are exported from `components/kokonutui/smooth-tabs.tsx`.
- Produces: `MotionCarousel({ slides, selectedIndex, onSelect }: MotionCarouselProps)` where `MotionCarouselProps = { slides: React.ReactNode[]; selectedIndex?: number; onSelect?: (index: number) => void }` — both new props optional, existing `slides`-only usage keeps working unchanged.

- [ ] **Step 1: Write `SmoothTabs`**

Create `components/kokonutui/smooth-tabs.tsx`:

```tsx
// components/kokonutui/smooth-tabs.tsx
"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  color: string;
};

type SmoothTabsProps = {
  items: TabItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  className?: string;
};

export function SmoothTabs({ items, selectedIndex, onSelect, className }: SmoothTabsProps) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto", className)}>
      {items.map((item, index) => {
        const isActive = index === selectedIndex;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={item.label}
            aria-current={isActive}
            className="relative flex shrink-0 items-center justify-center rounded-full p-2.5 transition-colors"
          >
            {isActive && (
              <motion.span
                layoutId="smooth-tabs-pill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: item.color }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                "relative z-10 size-5",
                isActive ? "text-white" : "text-muted-foreground"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add controlled mode to `MotionCarousel`, remove dot indicators**

Replace the full contents of `components/kokonutui/motion-carousel.tsx`:

```tsx
// components/kokonutui/motion-carousel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "motion/react";

type MotionCarouselProps = {
  slides: React.ReactNode[];
  /** Externally-controlled active slide index. Omit for uncontrolled use. */
  selectedIndex?: number;
  /** Fires whenever the active slide changes, from either a swipe or an external selectedIndex change. */
  onSelect?: (index: number) => void;
};

export function MotionCarousel({ slides, selectedIndex: controlledIndex, onSelect: onSelectProp }: MotionCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "center" });
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = controlledIndex ?? internalIndex;

  const handleEmblaSelect = useCallback(() => {
    if (!emblaApi) return;
    const index = emblaApi.selectedScrollSnap();
    setInternalIndex(index);
    onSelectProp?.(index);
  }, [emblaApi, onSelectProp]);

  useEffect(() => {
    if (!emblaApi) return;
    handleEmblaSelect();
    emblaApi.on("select", handleEmblaSelect);
    return () => {
      emblaApi.off("select", handleEmblaSelect);
    };
  }, [emblaApi, handleEmblaSelect]);

  // Drive embla when the controlled selectedIndex prop changes externally
  // (e.g. a tab was tapped), without fighting embla's own "select" events.
  useEffect(() => {
    if (!emblaApi || controlledIndex === undefined) return;
    if (emblaApi.selectedScrollSnap() !== controlledIndex) {
      emblaApi.scrollTo(controlledIndex);
    }
  }, [emblaApi, controlledIndex]);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((slide, index) => (
            <motion.div
              key={index}
              className="min-w-0 shrink-0 grow-0 basis-full px-1"
              animate={{ scale: index === activeIndex ? 1 : 0.94, opacity: index === activeIndex ? 1 : 0.7 }}
              transition={{ duration: 0.3 }}
            >
              {slide}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Note: `cn` is no longer used in this file (the dot indicators were its only
consumer) — the `import { cn } from "@/lib/utils"` line is intentionally
dropped, not left as a dead import.

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

This task has no visible UI change on its own yet (`SmoothTabs` isn't
rendered anywhere, and `MotionCarousel`'s only current call site in
`app/goals/page.tsx` doesn't pass the new props yet, so it falls back to
uncontrolled mode — behaviorally identical to before except the dots are
gone). Confirm this by visiting `http://127.0.0.1:3000/goals`: the carousel
should still swipe correctly between all 6 slides, just without dots below
it. That's expected for this task — Task 2 wires in the tab bar.

- [ ] **Step 4: Commit**

```bash
git add components/kokonutui/smooth-tabs.tsx components/kokonutui/motion-carousel.tsx
git commit -m "feat: add SmoothTabs component and controlled mode to MotionCarousel"
```

---

### Task 2: Wire `SmoothTabs` into the Goals page

**Files:**
- Modify: `app/goals/page.tsx`

**Interfaces:**
- Consumes: `SmoothTabs` and `TabItem` from `@/components/kokonutui/smooth-tabs` (Task 1). `MotionCarousel`'s `selectedIndex`/`onSelect` props (Task 1).

- [ ] **Step 1: Add imports**

In `app/goals/page.tsx`, add to the top of the import block (after the existing `MotionCarousel` import):

```tsx
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { Target, Scale, Flame, Utensils, HeartPulse, CalendarCheck } from 'lucide-react';
```

- [ ] **Step 2: Add tab definitions and selection state**

In `app/goals/page.tsx`, add this constant above the `GoalsPage` function (after the `supabase` const, before `export default function GoalsPage()`):

```tsx
const goalTabs: TabItem[] = [
  { id: 'goals', icon: Target, label: 'Goals', color: 'var(--chart-1)' },
  { id: 'weight', icon: Scale, label: 'Weight', color: 'var(--chart-2)' },
  { id: 'calories', icon: Flame, label: 'Calories', color: 'var(--chart-3)' },
  { id: 'food', icon: Utensils, label: 'Food', color: 'var(--chart-4)' },
  { id: 'stamina', icon: HeartPulse, label: 'Stamina', color: 'var(--chart-5)' },
  { id: 'meal-plan', icon: CalendarCheck, label: 'Meal Plan', color: 'var(--chart-1)' },
];
```

Inside `GoalsPage`, add new state next to the existing `useState` calls
(after `const [userId, setUserId] = useState<string | null>(null);`):

```tsx
  const [selectedIndex, setSelectedIndex] = useState(0);
```

- [ ] **Step 3: Render the sticky tab bar and wire the carousel**

Replace:

```tsx
  return (
    <div className="pb-16">
      <TopBar title="Fitness Goals" />
      <div className='px-4 py-2 flex flex-col gap-2'>

      {loading ? (
```

with:

```tsx
  return (
    <div className="pb-16">
      <TopBar title="Fitness Goals" />
      {!loading && (
        <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
          <SmoothTabs items={goalTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
        </div>
      )}
      <div className='px-4 py-2 flex flex-col gap-2'>

      {loading ? (
```

Then replace the `<MotionCarousel` opening tag:

```tsx
        <MotionCarousel
          slides={[
```

with:

```tsx
        <MotionCarousel
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          slides={[
```

(The rest of the `slides` array and the closing `/>` are unchanged.)

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `http://127.0.0.1:3000/goals` (log in as `push-verify@example.com` /
`PushVerify123!` if needed) and verify, in both light and dark mode:

1. A row of 6 icons renders below the "Fitness Goals" top bar, with the
   Goals icon (Target) highlighted with a colored pill by default.
2. Tapping each icon jumps the carousel to the matching section (Weight,
   Calories, Food, Stamina, Meal Plan) and the colored pill slides smoothly
   to that icon.
3. Swiping the carousel left/right updates which tab icon is highlighted,
   staying in sync with the swipe.
4. Scroll down within a tall section (e.g. tap the Weight tab, scroll down
   through `WeightTracker`'s content) and confirm the tab bar stays pinned
   below the top bar instead of scrolling away.
5. Check for a visible gap or overlap between `TopBar` and the sticky tab
   bar. If there's a gap or overlap, adjust the `top-14` class in the
   sticky wrapper (Step 3) to match `TopBar`'s actual rendered height and
   re-verify.
6. Confirm the 6 icons remain fully visible without wrapping onto a second
   row at a typical phone width (test at 390px viewport width via Chrome
   DevTools MCP's `resize_page` or by resizing the browser window).

- [ ] **Step 5: Commit**

```bash
git add app/goals/page.tsx
git commit -m "feat: wire SmoothTabs into the Goals page, synced with the carousel"
```
