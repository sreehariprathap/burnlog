# Liquid Glass UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt a liquid-glass Apple-style visual system across the app: glass cards (baked into the shared `Card` primitive), a floating-dock bottom nav, a global action search bar, a universal drawer replacing every modal, an AI loading state for the two big generators, a brand-colored splash background, milestone fireworks, a goals-page carousel, and a click-triggered radial quick-log menu — plus removing the dashboard's push-notification prompt.

**Architecture:** New components live in `components/kokonutui/` (matching the existing hand-copied `apple-activity-card.tsx` precedent) and `components/ui/drawer.tsx` (the one new shadcn primitive). The glass look is baked directly into `components/ui/card.tsx` so every existing `<Card>` usage app-wide upgrades with zero call-site changes. `BottomNav` and `QuickLogFab` keep their exact current export names/props so no consuming page needs edits. Two new dependencies: `vaul` (drawer) and `embla-carousel-react` (carousel).

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing via the Chrome DevTools MCP tools (use `http://127.0.0.1:3000`, not `localhost`, per this session's discovery that `localhost` can resolve to an unrelated process on this machine; test account `push-verify@example.com` / `PushVerify123!`).
- Tailwind v4, CSS-based config (`app/globals.css`, `@theme inline` block, no `tailwind.config.*` file). New CSS custom properties go as plain `:root`/`.dark` declarations (not inside `@theme`) unless they need to become a Tailwind utility token.
- `motion` (Framer Motion, already `^13.1.1`) covers all animation needs; do not add `framer-motion` (superseded name, would duplicate).
- Every existing modal conversion (Task 7, Task 8) must preserve exact current behavior (save success, save error, discard-on-close) — these are visual-only conversions, not behavior changes. Re-verify each converted modal against its pre-conversion behavior.
- Respect `prefers-reduced-motion`: the floating dock's tab-indicator animation, splash background, fireworks, and radial menu should degrade to instant/no-animation state changes when that media query is set (functionality must not depend on any animation completing).

---

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `vaul` and `embla-carousel-react` available as imports for Tasks 4 and 14.

- [ ] **Step 1: Install packages**

Run: `npm install vaul embla-carousel-react`
Expected: both added to `package.json` dependencies, `package-lock.json` updated, no errors.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new type errors (nothing imports them yet).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vaul and embla-carousel-react for drawer/carousel work"
```

---

### Task 2: Glass filter + Card primitive upgrade

**Files:**
- Create: `components/kokonutui/glass-filter.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `GlassFilter` component (internal, rendered once per `Card` instance via `useId()`). `Card` gains two new optional props: `glassSize?: 'sm' | 'default' | 'lg'` (padding variant) and `glassEffect?: boolean` (default `true`; set `false` to keep the blur/shadow look but skip the GPU-costly displacement filter on data-dense screens).

- [ ] **Step 1: Add glass shadow CSS variables**

In `app/globals.css`, add to the `:root` block (after `--sidebar-ring` line):
```css
  --glass-shadow: inset 1px 1px 0 0 rgba(255,255,255,0.5), inset -1px -1px 1px 0 rgba(255,255,255,0.3), inset 0 0 8px 1px rgba(255,255,255,0.25), 0 4px 12px rgba(0,0,0,0.08);
```

And to the `.dark` block (after `--sidebar-ring` line):
```css
  --glass-shadow: inset 1px 1px 0 0 rgba(255,255,255,0.1), inset -1px -1px 1px 0 rgba(0,0,0,0.4), inset 0 0 8px 1px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.35);
```

- [ ] **Step 2: Write the glass filter component**

```tsx
// components/kokonutui/glass-filter.tsx
"use client";

export function GlassFilter({ id, scale = 30 }: { id: string; scale?: number }) {
  const filterId = `glass-distortion-${id}`;

  return (
    <svg className="absolute h-0 w-0" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="2"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred1" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred1"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 2b: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Rewrite the Card primitive with the glass look**

Replace the full contents of `components/ui/card.tsx`:

```tsx
import * as React from "react"
import { useId } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { GlassFilter } from "@/components/kokonutui/glass-filter"

const cardVariants = cva("", {
  variants: {
    glassSize: {
      sm: "p-3 gap-3",
      default: "py-6 gap-6",
      lg: "p-8 gap-8",
    },
  },
  defaultVariants: {
    glassSize: "default",
  },
})

type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    glassEffect?: boolean
  }

function Card({ className, glassSize, glassEffect = true, style, children, ...rest }: CardProps) {
  const filterId = useId()
  const filterStyle: React.CSSProperties = glassEffect
    ? { filter: `url(#glass-distortion-${filterId})`, boxShadow: "var(--glass-shadow)" }
    : { boxShadow: "var(--glass-shadow)" }

  return (
    <div
      data-slot="card"
      className={cn(
        "group relative flex flex-col rounded-xl border border-white/10 bg-background/20 text-card-foreground backdrop-blur-[2px] overflow-hidden",
        cardVariants({ glassSize }),
        className
      )}
      style={{ ...filterStyle, ...style }}
      {...rest}
    >
      {glassEffect && <GlassFilter id={filterId} scale={30} />}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-r from-transparent via-black/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-[inherit]">{children}</div>
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
```

Note: `Card`'s own padding (`py-6`/`gap-6` etc, now driven by `glassSize`) previously came from the plain `flex flex-col gap-6 ... py-6` classes — this rewrite keeps the same default spacing (`glassSize="default"` → `py-6 gap-6`), so existing call sites that don't pass `glassSize` look the same as before, just with the added glass treatment.

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors — this is a wide-blast-radius change (every `<Card>` in the app), so a type error here would show up immediately.

Start the dev server if not running, open `http://127.0.0.1:3000/dashboard` (log in as `push-verify@example.com` / `PushVerify123!` if needed) and confirm: existing cards (welcome card, rings widget, BMI/goal-progress/shortcut widgets) now show a translucent blurred background with a subtle inset-shadow bevel, in both light and dark mode (toggle via the theme switch), and text inside remains readable (adequate contrast against the blurred background).

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/glass-filter.tsx components/ui/card.tsx app/globals.css
git commit -m "feat: bake liquid-glass styling into the shared Card primitive"
```

---

### Task 3: LiquidButton

**Files:**
- Create: `components/kokonutui/liquid-button.tsx`

**Interfaces:**
- Produces: `LiquidButton`, a thin wrapper around the existing `Button` (`components/ui/button.tsx`) adding glass shadow/filter styling and scale-based press/hover feedback. Prop: `liquidVariant?: 'default' | 'none'` (`'none'` skips the scale animations, otherwise identical to `Button`'s own `ButtonProps`).

- [ ] **Step 1: Write the component**

```tsx
// components/kokonutui/liquid-button.tsx
"use client";

import * as React from "react";
import { useId } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { GlassFilter } from "@/components/kokonutui/glass-filter";
import { cn } from "@/lib/utils";

type LiquidButtonProps = ButtonProps & {
  liquidVariant?: "default" | "none";
};

export function LiquidButton({
  className,
  liquidVariant = "default",
  style,
  ...props
}: LiquidButtonProps) {
  const id = useId();

  return (
    <>
      {liquidVariant === "default" && <GlassFilter id={id} scale={70} />}
      <Button
        className={cn(
          "relative border border-white/10 bg-background/30 backdrop-blur-[2px]",
          liquidVariant === "default" &&
            "transition-transform duration-200 active:scale-[0.97] hover:scale-105",
          className
        )}
        style={{
          boxShadow: "var(--glass-shadow)",
          ...(liquidVariant === "default"
            ? { filter: `url(#glass-distortion-${id})` }
            : {}),
          ...style,
        }}
        {...props}
      />
    </>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add components/kokonutui/liquid-button.tsx
git commit -m "feat: add LiquidButton glass-styled button variant"
```

---

### Task 4: Drawer primitive

**Files:**
- Create: `components/ui/drawer.tsx`

**Interfaces:**
- Produces: standard shadcn-style `Drawer`/`DrawerTrigger`/`DrawerPortal`/`DrawerClose`/`DrawerOverlay`/`DrawerContent`/`DrawerHeader`/`DrawerFooter`/`DrawerTitle`/`DrawerDescription`, wrapping `vaul`. Prop contract (`open`, `onOpenChange` on `Drawer`) matches Radix `Dialog`'s exactly, so every conversion in Tasks 7-8 is a drop-in swap.

- [ ] **Step 1: Write the component**

```tsx
// components/ui/drawer.tsx
"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-background",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[90vh] data-[vaul-drawer-direction=bottom]:rounded-t-2xl data-[vaul-drawer-direction=bottom]:border-t",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-4 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/drawer.tsx
git commit -m "feat: add vaul-based Drawer primitive"
```

---

### Task 5: Floating dock nav

**Files:**
- Modify: `components/BottomNav.tsx`

**Interfaces:**
- Produces: same `BottomNav()` export, same 5 routes/labels/icons, same active-route logic — internal rendering only changes. No caller needs updates.

- [ ] **Step 1: Rewrite as a floating glass dock**

Replace the full contents of `components/BottomNav.tsx`:

```tsx
// components/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  HomeIcon,
  DumbbellIcon,
  TargetIcon,
  UserIcon,
  ChartLine
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/session',   label: 'Workout', Icon: DumbbellIcon },
  { href: '/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/insights',  label: 'Insights', Icon: ChartLine },
  { href: '/profile',   label: 'Profile', Icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

With the dev server running, visit `http://127.0.0.1:3000/dashboard`, confirm the nav now renders as a floating pill near the bottom of the screen (not a full-width bar), all 5 tabs are visible and correctly labeled, the active tab (Home, since we're on `/dashboard`) shows the highlighted pill background, and navigating to `/goals`/`/session`/`/insights`/`/profile` correctly moves the active-tab highlight and updates the active route.

Since `main` content in several pages uses `pb-16` to clear the old full-width bar, visually confirm the floating dock doesn't overlap page content awkwardly on at least `/dashboard` and `/goals` — if it does, that's an acceptable follow-up (padding tuning), not a blocker, since the dock is a fixed z-40 overlay and current `pb-16` already reserves clearance.

- [ ] **Step 3: Commit**

```bash
git add components/BottomNav.tsx
git commit -m "feat: rewrite BottomNav as a floating liquid-glass dock"
```

---

### Task 6: Remove push notification prompt from dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Produces: dashboard no longer imports or renders `PushNotificationPrompt`. The component file itself is untouched (left unused, not deleted — the underlying subscribe flow still backs the scheduled reminders and admin test-push features).

- [ ] **Step 1: Remove the import and render call**

In `app/dashboard/page.tsx`, remove this line:
```tsx
import { PushNotificationPrompt } from './_components/PushNotificationPrompt';
```

And remove these lines:
```tsx
        {/* Push Notification Prompt */}
        <PushNotificationPrompt />

```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `/dashboard`, confirm the push-notification banner no longer appears.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "chore: remove push notification prompt from dashboard"
```

---

### Task 7: Convert the 4 dashboard quick-log modals to Drawer

**Files:**
- Modify: `app/dashboard/_components/quick-log/LogCaloriesModal.tsx`
- Modify: `app/dashboard/_components/quick-log/LogWorkoutModal.tsx`
- Modify: `app/dashboard/_components/quick-log/LogStepsModal.tsx`
- Modify: `app/dashboard/_components/quick-log/WalkTrackerModal.tsx`

**Interfaces:**
- Consumes: `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` (Task 4).
- Produces: identical prop contracts (`{ profileId, onClose, onSaved }`), identical internal form logic — only the outer wrapper markup changes from a hand-rolled `fixed inset-0 ... bg-black/60` overlay `<div><Card>` to `<Drawer open onOpenChange={...}><DrawerContent>`.

- [ ] **Step 1: Convert `LogCaloriesModal.tsx`**

Replace the return statement's outer wrapper. Change:
```tsx
  if (showScanner) {
    return <FoodScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Calories</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo')}>
```
to:
```tsx
  if (showScanner) {
    return <FoodScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />;
  }

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Calories</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo')}>
```

And change the closing tags at the end of the return statement. Find:
```tsx
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```
(this is the last block in `LogCaloriesModal.tsx`) and replace with:
```tsx
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

Update the imports at the top: remove `import { Card, CardContent } from '@/components/ui/card';` and `import { X } from 'lucide-react';` (the manual close button is gone — `vaul`'s drawer closes via swipe-down/overlay-click, matching the component's own UX; `DrawerContent` already renders vaul's drag handle), add:
```tsx
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
```

- [ ] **Step 2: Convert `LogWorkoutModal.tsx`**

Same pattern. Replace:
```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Workout</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="activityType">Workout Type</Label>
```
with:
```tsx
  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Workout</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <Label htmlFor="activityType">Workout Type</Label>
```

And at the end, replace:
```tsx
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```
with:
```tsx
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

Update imports: remove `Card, CardContent` and `X` imports, add the same `Drawer` import line as Step 1.

- [ ] **Step 3: Convert `LogStepsModal.tsx`**

Same pattern. Replace:
```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Steps</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="steps">Steps</Label>
```
with:
```tsx
  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Steps</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="steps">Steps</Label>
```

And at the end, replace:
```tsx
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```
with:
```tsx
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

Update imports: remove `Card, CardContent` and `X`, add the `Drawer` import.

- [ ] **Step 4: Convert `WalkTrackerModal.tsx`**

Same pattern, note this one has two conditional inner views (idle screen vs tracking screen) inside one shared wrapper — keep that inner conditional exactly as-is, only change the outer wrapper. Replace:
```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">🚶 Walk Tracker</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {showIdleScreen ? (
```
with:
```tsx
  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>🚶 Walk Tracker</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-5">
          {showIdleScreen ? (
```

And at the very end, replace:
```tsx
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```
with:
```tsx
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

Update imports: remove `Card, CardContent` and `X`, add the `Drawer` import.

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors across all 4 files.

With the dev server running, on `/dashboard`, open the quick-log menu and test each of the 4 actions:
1. **Log Steps**: opens as a bottom drawer (slides up, drag handle visible), enter a step count, save, confirm it closes and the dashboard rings update.
2. **Log Workout**: same drawer behavior; test both manual entry and the AI-estimate button; confirm save works and error states (e.g. AI failure) still render inline.
3. **Log Calories**: confirm the Manual/Photo tabs still work inside the drawer; confirm tapping "Scan Food Photo" still opens `FoodScanner` correctly (unconverted in this task — still its own overlay, converted in Task 8).
4. **Walk Tracker**: confirm the idle→tracking→finish flow still works identically inside the drawer, including the manual-fallback steps input.

For each, also confirm swiping the drawer down (or clicking the overlay) closes it without saving (matches the pre-conversion "close without Finish/Save discards" behavior).

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/_components/quick-log/LogCaloriesModal.tsx app/dashboard/_components/quick-log/LogWorkoutModal.tsx app/dashboard/_components/quick-log/LogStepsModal.tsx app/dashboard/_components/quick-log/WalkTrackerModal.tsx
git commit -m "refactor: convert dashboard quick-log modals to Drawer"
```

---

### Task 8: Convert FoodScanner, AI Model Settings, and Onboarding Toggles to Drawer

**Files:**
- Modify: `app/goals/_components/FoodScanner.tsx`
- Modify: `app/profile/_components/AiModelSettingsModal.tsx`
- Modify: `app/profile/_components/OnboardingPageTogglesModal.tsx`

**Interfaces:**
- Consumes: `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` (Task 4).
- Produces: `FoodScanner` keeps its `{ onResult, onClose }` prop contract; `AiModelSettingsModal` and `OnboardingPageTogglesModal` keep their `{ open, onOpenChange }` contract (already identical to `Drawer`'s own props — the conversion for these two is the simplest of the whole plan, since Radix `Dialog` and vaul `Drawer` share that exact prop shape).

- [ ] **Step 1: Convert `FoodScanner.tsx`**

Replace the outer wrapper. Find:
```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">📸 Scan Food</h2>
              <p className="text-xs text-muted-foreground">AI analyses your meal and estimates calories & macros</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
```
with:
```tsx
  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>📸 Scan Food</DrawerTitle>
          <p className="text-xs text-muted-foreground">AI analyses your meal and estimates calories & macros</p>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
```

And at the end, find:
```tsx
        </CardContent>
      </Card>
    </div>
  );
}
```
replace with:
```tsx
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

Update imports: remove `Card, CardContent` and `X`, add `import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';`.

- [ ] **Step 2: Convert `AiModelSettingsModal.tsx`**

This one already takes `{ open, onOpenChange }` and wraps `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`. Change only the import and the 3 component names used in JSX (props stay identical). Replace:
```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```
with:
```tsx
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
```

Then in the JSX, replace every `Dialog` → `Drawer`, `DialogContent` → `DrawerContent`, `DialogHeader` → `DrawerHeader`, `DialogTitle` → `DrawerTitle` (4 tag-name swaps total: the opening `<Dialog open={open} onOpenChange={onOpenChange}>` becomes `<Drawer open={open} onOpenChange={onOpenChange}>`, `<DialogContent>`/`</DialogContent>` becomes `<DrawerContent>`/`</DrawerContent>`, `<DialogHeader>`/`</DialogHeader>` becomes `<DrawerHeader>`/`</DrawerHeader>`, `<DialogTitle>`/`</DialogTitle>` becomes `<DrawerTitle>`/`</DrawerTitle>`, closing `</Dialog>` becomes `</Drawer>`).

- [ ] **Step 3: Convert `OnboardingPageTogglesModal.tsx`**

Identical swap pattern to Step 2 (same `{ open, onOpenChange }` prop contract, same `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` → `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` tag renames).

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

On `/goals`, open the food scanner (via the Log Calories drawer's Photo tab from Task 7), confirm it now renders as a drawer, camera/upload buttons still work.

On `/profile` (as admin), open "Manage Models" and "Manage Pages", confirm both now render as drawers, confirm selections/toggles still save correctly (re-verify the model dropdowns persist on reopen, re-verify page toggles still write to the DB).

- [ ] **Step 5: Commit**

```bash
git add app/goals/_components/FoodScanner.tsx app/profile/_components/AiModelSettingsModal.tsx app/profile/_components/OnboardingPageTogglesModal.tsx
git commit -m "refactor: convert FoodScanner and admin modals to Drawer"
```

---

### Task 9: Radial quick-log menu

**Files:**
- Create: `components/kokonutui/radial-menu.tsx`
- Modify: `app/dashboard/_components/QuickLogFab.tsx`

**Interfaces:**
- Produces: `RadialMenu({ open, items, onClose }: { open: boolean; items: { key: string; label: string; icon: React.ReactNode; onSelect: () => void }[]; onClose: () => void })` — a click-triggered (not auto-looping) circular arrangement of action buttons, positioned relative to a trigger point, animated in/out via Framer Motion `AnimatePresence`.
- Consumes (in `QuickLogFab`): `RadialMenu` in place of the current `Dialog`-based list menu. Keeps the exact `{ profileId, onLogged }` prop contract and the 4 drawer components it already renders on selection (`LogCaloriesModal`, `LogWorkoutModal`, `LogStepsModal`, `WalkTrackerModal` — now drawers per Task 7, unchanged by this task).

- [ ] **Step 1: Write the radial menu component**

```tsx
// components/kokonutui/radial-menu.tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type RadialMenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

type RadialMenuProps = {
  open: boolean;
  items: RadialMenuItem[];
  onClose: () => void;
  /** Orbit radius in px. Defaults to a value that fits comfortably on a phone screen. */
  radius?: number;
};

export function RadialMenu({ open, items, onClose, radius = 110 }: RadialMenuProps) {
  // Arrange items across a 180° arc above the trigger (avoids clipping off-screen
  // on narrow viewports, unlike a full 360° orbit).
  const arcStart = 200; // degrees
  const arcEnd = 340;
  const step = items.length > 1 ? (arcEnd - arcStart) / (items.length - 1) : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {items.map((item, index) => {
            const angleDeg = arcStart + step * index;
            const angleRad = (angleDeg * Math.PI) / 180;
            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;

            return (
              <motion.button
                key={item.key}
                className={cn(
                  "fixed z-50 flex h-14 w-14 flex-col items-center justify-center rounded-full",
                  "border border-white/10 bg-background/60 text-foreground shadow-lg backdrop-blur-md"
                )}
                style={{ bottom: `calc(5.5rem - ${y}px)`, right: `calc(1rem - ${x}px)` }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: "spring", stiffness: 300, damping: 22, delay: index * 0.03 }}
                onClick={() => {
                  item.onSelect();
                }}
                aria-label={item.label}
              >
                {item.icon}
                <span className="mt-0.5 text-[9px] leading-none">{item.label}</span>
              </motion.button>
            );
          })}
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors. Full interactive verification happens in Step 4 once wired in.

- [ ] **Step 3: Rewrite `QuickLogFab.tsx` to use it**

Replace the full contents of `app/dashboard/_components/QuickLogFab.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { RadialMenu } from '@/components/kokonutui/radial-menu';
import { LogCaloriesModal } from './quick-log/LogCaloriesModal';
import { LogWorkoutModal } from './quick-log/LogWorkoutModal';
import { LogStepsModal } from './quick-log/LogStepsModal';
import { WalkTrackerModal } from './quick-log/WalkTrackerModal';

type QuickLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

type ModalKey = 'calories' | 'workout' | 'steps' | 'walk' | null;

export function QuickLogFab({ profileId, onLogged }: QuickLogFabProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<ModalKey>(null);

  const handleSaved = () => {
    setOpen(null);
    onLogged();
  };

  const items = [
    { key: 'calories', label: 'Calories', icon: <span className="text-lg">🍽️</span>, onSelect: () => { setMenuOpen(false); setOpen('calories'); } },
    { key: 'workout', label: 'Workout', icon: <span className="text-lg">🏋️</span>, onSelect: () => { setMenuOpen(false); setOpen('workout'); } },
    { key: 'steps', label: 'Steps', icon: <span className="text-lg">🚶</span>, onSelect: () => { setMenuOpen(false); setOpen('steps'); } },
    { key: 'walk', label: 'Walk', icon: <span className="text-lg">🚶</span>, onSelect: () => { setMenuOpen(false); setOpen('walk'); } },
  ];

  return (
    <>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Quick log"
        aria-expanded={menuOpen}
      >
        <Plus className="h-6 w-6" />
      </button>

      <RadialMenu open={menuOpen} items={items} onClose={() => setMenuOpen(false)} />

      {open === 'calories' && (
        <LogCaloriesModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'workout' && (
        <LogWorkoutModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'steps' && (
        <LogStepsModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'walk' && (
        <WalkTrackerModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

On `/dashboard`, tap the "+" button, confirm the 4 action buttons animate outward in an arc above/around it (not a stacked dialog list anymore), tap "Calories", confirm the Log Calories drawer opens exactly as before; tap outside the radial menu (or the dimmed backdrop) while it's open (before selecting anything), confirm it collapses back without opening any drawer. Repeat for Workout/Steps/Walk to confirm each still opens its correct drawer.

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/radial-menu.tsx app/dashboard/_components/QuickLogFab.tsx
git commit -m "feat: replace quick-log dialog menu with a click-triggered radial menu"
```

---

### Task 10: Action Search Bar

**Files:**
- Create: `components/kokonutui/action-search-bar.tsx`
- Modify: `components/TopBar.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Produces: `ActionSearchBar({ open, onOpenChange, profileId, isAdmin, onQuickLog }: { open: boolean; onOpenChange: (open: boolean) => void; profileId: string; isAdmin: boolean; onQuickLog: (key: 'calories' | 'workout' | 'steps' | 'walk') => void })` — full-screen search overlay with debounced filtering and keyboard navigation over a fixed action list.
- Consumes: `useDebounce` (new small local hook, inlined in the same file per the source spec rather than a separate `lib/` file, since it's only used here).

- [ ] **Step 1: Write the component**

```tsx
// components/kokonutui/action-search-bar.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Flame,
  Dumbbell,
  Footprints,
  Scale,
  Target,
  LineChart,
  Cpu,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

type Action = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  run: () => void;
};

type ActionSearchBarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onQuickLog: (key: "calories" | "workout" | "steps" | "walk") => void;
};

export function ActionSearchBar({ open, onOpenChange, isAdmin, onQuickLog }: ActionSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement>(null);

  const allActions: Action[] = useMemo(
    () => [
      { id: "calories", label: "Log Calories", description: "Manual entry or AI photo scan", icon: <Flame className="h-4 w-4" />, run: () => onQuickLog("calories") },
      { id: "workout", label: "Log Workout", description: "Manual entry or AI calorie estimate", icon: <Dumbbell className="h-4 w-4" />, run: () => onQuickLog("workout") },
      { id: "steps", label: "Log Steps", description: "Manual step entry", icon: <Footprints className="h-4 w-4" />, run: () => onQuickLog("steps") },
      { id: "walk", label: "Start Walk", description: "Live step + duration tracking", icon: <Footprints className="h-4 w-4" />, run: () => onQuickLog("walk") },
      { id: "weight", label: "Track Weight", description: "Open the weight tracker", icon: <Scale className="h-4 w-4" />, run: () => router.push("/goals") },
      { id: "goals", label: "Set Goals", description: "Manage your fitness goals", icon: <Target className="h-4 w-4" />, run: () => router.push("/goals") },
      { id: "session", label: "Start Workout Session", description: "Today's planned session", icon: <Dumbbell className="h-4 w-4" />, run: () => router.push("/session") },
      { id: "insights", label: "View Insights", description: "Progress charts and trends", icon: <LineChart className="h-4 w-4" />, run: () => router.push("/insights") },
      ...(isAdmin
        ? [{ id: "ai-models", label: "Manage AI Models", description: "Admin: choose free OpenRouter models", icon: <Cpu className="h-4 w-4" />, run: () => router.push("/profile") }]
        : []),
    ],
    [isAdmin, onQuickLog, router]
  );

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return allActions;
    return allActions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  }, [allActions, debouncedQuery]);

  useEffect(() => {
    setHighlighted(0);
  }, [debouncedQuery]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = filtered[highlighted];
      if (action) {
        onOpenChange(false);
        action.run();
      }
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col bg-background/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2 border-b p-4">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Log calories, start a walk, track weight…"
              className="border-none shadow-none focus-visible:ring-0"
            />
            <button onClick={() => onOpenChange(false)} aria-label="Close search">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <motion.div className="flex-1 overflow-y-auto p-2" initial="hidden" animate="visible">
            {filtered.map((action, index) => (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => {
                  onOpenChange(false);
                  action.run();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",
                  index === highlighted ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {action.icon}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{action.label}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </span>
              </motion.button>
            ))}
            {filtered.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No matching actions</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Add a search trigger to TopBar**

`components/TopBar.tsx` already accepts an `actions?: React.ReactNode` slot — no change needed to `TopBar.tsx` itself. Instead, the search icon + `ActionSearchBar` + its open state are composed together in `app/dashboard/page.tsx` (the only page with the quick-log drawers this action bar needs to trigger), passed into `TopBar`'s `actions` prop.

- [ ] **Step 3: Wire into `app/dashboard/page.tsx`**

Add imports:
```tsx
import { Search } from 'lucide-react';
import { ActionSearchBar } from '@/components/kokonutui/action-search-bar';
```

Add state near the other `useState` calls:
```tsx
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickLogTrigger, setQuickLogTrigger] = useState<'calories' | 'workout' | 'steps' | 'walk' | null>(null);
```

Change the `<TopBar title="Dashboard" />` line to:
```tsx
      <TopBar
        title="Dashboard"
        actions={
          <button onClick={() => setSearchOpen(true)} aria-label="Search actions">
            <Search className="h-5 w-5" />
          </button>
        }
      />
```

Render the search overlay and wire `quickLogTrigger` into `QuickLogFab` — since `QuickLogFab` (Task 9) manages its own `open` modal state internally and doesn't currently accept an external trigger, add a minimal prop to it: `initialOpen?: 'calories' | 'workout' | 'steps' | 'walk' | null`. In `app/dashboard/_components/QuickLogFab.tsx` (from Task 9), change the `open` state initializer and add a `useEffect`:
```tsx
export function QuickLogFab({ profileId, onLogged, initialOpen }: QuickLogFabProps & { initialOpen?: ModalKey }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<ModalKey>(null);

  useEffect(() => {
    if (initialOpen) setOpen(initialOpen);
  }, [initialOpen]);
```
(add `import { useEffect } from 'react';` alongside the existing `useState` import in that file.)

Then in `app/dashboard/page.tsx`, render:
```tsx
      <ActionSearchBar
        open={searchOpen}
        onOpenChange={setSearchOpen}
        isAdmin={!!userProfile?.isAdmin}
        onQuickLog={(key) => setQuickLogTrigger(key)}
      />
```
next to the existing `QuickLogFab` render, and update that render to pass the trigger through and reset it once consumed:
```tsx
      {userProfile && (
        <QuickLogFab
          profileId={userProfile.id}
          onLogged={() => setRefreshKey((k) => k + 1)}
          initialOpen={quickLogTrigger}
        />
      )}
```
Add a small reset so re-selecting the same action from search again still works (otherwise the `useEffect` in `QuickLogFab` only fires on change): after passing `quickLogTrigger` down, reset it in the parent once `QuickLogFab`'s modal opens — simplest approach is to reset it immediately after setting, since `QuickLogFab`'s own `open` state is what actually persists the drawer's visibility once triggered:
```tsx
              onQuickLog={(key) => {
                setQuickLogTrigger(key);
                setTimeout(() => setQuickLogTrigger(null), 0);
              }}
```
(replace the `onQuickLog` prop above with this version — the `setTimeout(...,0)` clears the trigger on the next tick, after `QuickLogFab`'s effect has already consumed it, so a repeat selection of the same action later still re-triggers the effect via the null→value transition.)

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

On `/dashboard`, tap the search icon in the top bar, confirm the full-screen overlay opens with all actions listed, type "walk" and confirm it filters to just the Walk-related action(s), use arrow keys to highlight a different result, press Enter and confirm it either opens the correct drawer (for quick-log actions) or navigates (for route actions). Confirm "Manage AI Models" only appears for the admin test account, not for a non-admin account. Confirm Escape closes the overlay.

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/action-search-bar.tsx app/dashboard/page.tsx app/dashboard/_components/QuickLogFab.tsx
git commit -m "feat: add global Action Search Bar for major app actions"
```

---

### Task 11: AI Loading component for the two big generators

**Files:**
- Create: `components/kokonutui/ai-loading.tsx`
- Modify: `app/ai-setup/_components/AiSetupFlow.tsx`
- Modify: `app/goals/_components/MealPlanWidget.tsx`

**Interfaces:**
- Produces: `AiLoading({ tasks }: { tasks?: string[] })` — six-ring SVG progress spinner + scrolling code-style task log, defaulting to a generic task list if `tasks` is omitted.

- [ ] **Step 1: Write the component**

```tsx
// components/kokonutui/ai-loading.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const RING_COLORS = ["#FF9E4F", "#FF3D71", "#4ADE80", "#FFA726", "#FFEB3B", "#FF4081"];

const DEFAULT_TASKS = [
  "Reviewing your profile",
  "Analyzing your preferences",
  "Generating recommendations",
  "Finalizing details",
];

export function AiLoading({ tasks = DEFAULT_TASKS }: { tasks?: string[] }) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPaused(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setVisibleIndex((i) => (i + 1) % tasks.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [paused, tasks.length]);

  const progress = ((visibleIndex + 1) / tasks.length) * 100;

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4 py-8">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {RING_COLORS.map((color, i) => {
            const r = 46 - i * 6;
            const circumference = 2 * Math.PI * r;
            const offset = circumference * (1 - progress / 100);
            return (
              <circle
                key={color}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                opacity={0.85}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            );
          })}
        </svg>
      </div>

      <div className="w-full max-w-xs overflow-hidden rounded-md border bg-muted/30 font-mono text-xs">
        {tasks.slice(0, visibleIndex + 1).slice(-5).map((task, i) => (
          <div
            key={task + i}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 transition-opacity",
              i === Math.min(visibleIndex, 4) ? "opacity-100" : "opacity-50"
            )}
          >
            <span className="text-muted-foreground">{String(visibleIndex - Math.min(visibleIndex, 4) + i + 1).padStart(2, "0")}</span>
            <span>{task}…</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Wire into `AiSetupFlow.tsx`**

Add the import: `import { AiLoading } from '@/components/kokonutui/ai-loading';`

Replace:
```tsx
      {step === 'generating' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin h-8 w-8" />
          <p className="text-sm text-muted-foreground">Generating your personalized plan…</p>
        </div>
      )}
```
with:
```tsx
      {step === 'generating' && (
        <AiLoading tasks={["Analyzing your lifestyle", "Building your weekly split", "Balancing recovery days", "Finalizing your plan"]} />
      )}
```

(Leave the `step === 'loading'` block — the initial page-load spinner, not an AI-generation state — unchanged; it's out of scope.)

- [ ] **Step 4: Wire into `MealPlanWidget.tsx`**

Add the import: `import { AiLoading } from '@/components/kokonutui/ai-loading';`

Replace:
```tsx
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            Crafting your personalised 7-day meal plan…<br />
            <span className="text-xs">This takes about 20 seconds</span>
          </p>
        </CardContent>
      </Card>
    );
  }
```
with:
```tsx
  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <AiLoading tasks={["Reviewing your goals", "Planning your meals", "Balancing macros", "Building your grocery list"]} />
        </CardContent>
      </Card>
    );
  }
```

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

On `/goals`, tap "Generate My Meal Plan", confirm the new ring-spinner + scrolling task log renders while the AI call is in flight, and correctly transitions to the generated plan on completion (or the existing error message on failure). Trigger the AI setup flow's plan-generation step similarly (via `/ai-setup`) and confirm the same.

- [ ] **Step 6: Commit**

```bash
git add components/kokonutui/ai-loading.tsx app/ai-setup/_components/AiSetupFlow.tsx app/goals/_components/MealPlanWidget.tsx
git commit -m "feat: add AI Loading component to meal-plan and workout-plan generation"
```

---

### Task 12: Splash screen background

**Files:**
- Create: `components/kokonutui/background-paths.tsx`
- Modify: `components/SplashScreen.tsx`

**Interfaces:**
- Produces: `BackgroundPaths({ className }: { className?: string })` — layered animated SVG paths using the app's amber/orange/red palette, no `title` prop needed here (the splash screen already renders its own `KineticText` title on top).

- [ ] **Step 1: Write the component**

```tsx
// components/kokonutui/background-paths.tsx
"use client";

import { memo, useMemo } from "react";
import { motion } from "motion/react";

const BRAND_COLORS = ["#F97316", "#FBBF24", "#EF4444"];

function generatePaths(count: number, amplitude: number) {
  return Array.from({ length: count }, (_, i) => {
    const seed = i / count;
    const yBase = 40 + seed * 300;
    const wave = Math.sin(seed * Math.PI * 2) * amplitude;
    return {
      id: i,
      d: `M-100 ${yBase} Q 400 ${yBase + wave}, 900 ${yBase} T 1900 ${yBase}`,
      color: BRAND_COLORS[i % BRAND_COLORS.length],
    };
  });
}

function BackgroundPathsInner({ className }: { className?: string }) {
  const primary = useMemo(() => generatePaths(12, 60), []);
  const secondary = useMemo(() => generatePaths(15, 40), []);
  const accent = useMemo(() => generatePaths(10, 25), []);

  const groups = [
    { paths: primary, width: 4, duration: 25 },
    { paths: secondary, width: 3, duration: 20 },
    { paths: accent, width: 2, duration: 15 },
  ];

  return (
    <svg
      className={className}
      viewBox="0 0 1600 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="background-paths-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={BRAND_COLORS[0]} stopOpacity={0.5} />
          <stop offset="50%" stopColor={BRAND_COLORS[1]} stopOpacity={0.4} />
          <stop offset="100%" stopColor={BRAND_COLORS[2]} stopOpacity={0.5} />
        </linearGradient>
      </defs>
      {groups.map((group, gi) =>
        group.paths.map((path, pi) => (
          <motion.path
            key={`${gi}-${path.id}`}
            d={path.d}
            stroke="url(#background-paths-gradient)"
            strokeWidth={group.width}
            fill="none"
            initial={{ y: 0, opacity: 0.3 }}
            animate={{ y: [-15 + pi, -5 - pi, -15 + pi], opacity: [0.3, 0.6, 0.3] }}
            transition={{
              duration: group.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: pi * 0.2,
            }}
          />
        ))
      )}
    </svg>
  );
}

export const BackgroundPaths = memo(BackgroundPathsInner);
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Add it behind the splash screen content**

In `components/SplashScreen.tsx`, add the import: `import { BackgroundPaths } from '@/components/kokonutui/background-paths';`

Insert the new layer between the existing "fire glow backdrop" div and the `KineticText` content block:
```tsx
      {/* fire glow backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 45%, rgba(255,158,79,0.35), transparent 70%), radial-gradient(50% 40% at 50% 60%, rgba(255,61,113,0.30), transparent 70%)',
        }}
      />

      <BackgroundPaths className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />

      <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
```

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Clear the splash gate and reload: in the browser console (DevTools), run `sessionStorage.removeItem('burnlog-splash-shown')`, then reload the app. Confirm the animated brand-colored paths render behind the "burnlog" wordmark for the ~2 second splash duration, with clear contrast against the `#1a0f0a` background (warm orange/amber/red against near-black — should read as clearly visible, not washed out).

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/background-paths.tsx components/SplashScreen.tsx
git commit -m "feat: add animated brand-colored background paths to splash screen"
```

---

### Task 13: Fireworks celebration on milestones

**Files:**
- Create: `components/kokonutui/fireworks-background.tsx`
- Modify: `components/AchievementOverlay.tsx`
- Modify: `app/session/_components/CompletionTracker.tsx`

**Interfaces:**
- Produces: `FireworksBackground({ color, population }: { color?: string[]; population?: number })` — canvas-based fireworks animation, absolutely positioned to fill its container.
- `AchievementOverlay` gains a new optional prop `celebrate?: boolean` — when true, renders `FireworksBackground` behind the existing achievement card content.
- `CompletionTracker` computes `celebrate` (level-up OR streak-milestone) and passes it through to `setAchievement`.

- [ ] **Step 1: Write the fireworks component**

```tsx
// components/kokonutui/fireworks-background.tsx
"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
};

type Firework = {
  x: number;
  y: number;
  targetY: number;
  vy: number;
  color: string;
  exploded: boolean;
  particles: Particle[];
};

const BRAND_COLORS = ["#F97316", "#FBBF24", "#EF4444", "#FF9E4F"];

export function FireworksBackground({
  color = BRAND_COLORS,
  population = 3,
}: {
  color?: string[];
  population?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const fireworks: Firework[] = [];
    let frameId: number;
    let spawnTimer = 0;

    function spawnFirework() {
      const c = color[Math.floor(Math.random() * color.length)];
      fireworks.push({
        x: Math.random() * width,
        y: height,
        targetY: height * 0.2 + Math.random() * height * 0.3,
        vy: -(6 + Math.random() * 3),
        color: c,
        exploded: false,
        particles: [],
      });
    }

    function explode(fw: Firework) {
      const count = 40;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 2 + Math.random() * 4;
        fw.particles.push({
          x: fw.x,
          y: fw.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: fw.color,
          life: 1,
        });
      }
    }

    function tick() {
      if (!ctx) return;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, width, height);

      spawnTimer++;
      if (spawnTimer > 40 / population) {
        spawnFirework();
        spawnTimer = 0;
      }

      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        if (!fw.exploded) {
          fw.y += fw.vy;
          ctx.beginPath();
          ctx.arc(fw.x, fw.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = fw.color;
          ctx.fill();
          if (fw.y <= fw.targetY) {
            fw.exploded = true;
            explode(fw);
          }
        } else {
          let alive = false;
          for (const p of fw.particles) {
            if (p.life <= 0) continue;
            alive = true;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.life -= 0.02;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(p.life, 0);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (!alive) fireworks.splice(i, 1);
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [color, population]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Wire into `AchievementOverlay`**

Add the import: `import { FireworksBackground } from '@/components/kokonutui/fireworks-background';`

Add `celebrate?: boolean` to the props type:
```tsx
type AchievementOverlayProps = {
  open: boolean;
  title: string;
  message?: string;
  stats?: string[];
  onClose: () => void;
  autoCloseMs?: number;
  celebrate?: boolean;
};
```

Add `celebrate = false` to the destructured props, and render `FireworksBackground` inside the outer dialog container (behind the card), right after the opening `<div role="dialog" ...>`:
```tsx
export function AchievementOverlay({
  open,
  title,
  message = 'Amazing work — keep the streak burning!',
  stats = [],
  onClose,
  autoCloseMs = 0,
  celebrate = false,
}: AchievementOverlayProps) {
```
and:
```tsx
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      {celebrate && <FireworksBackground />}
      <div
```

- [ ] **Step 4: Compute the milestone flags in `CompletionTracker`**

In `app/session/_components/CompletionTracker.tsx`, the profile fetch currently selects `id, currentStreak, longestStreak, xp, lastSessionDate` — add `level` to that select:
```tsx
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, currentStreak, longestStreak, xp, level, lastSessionDate')
        .eq('userId', user.id)
        .single();
```

Change the `achievement` state type and the celebration block. Replace:
```tsx
  const [achievement, setAchievement] = useState<{ stats: string[] } | null>(null);
```
with:
```tsx
  const [achievement, setAchievement] = useState<{ stats: string[]; celebrate: boolean } | null>(null);
```

Replace:
```tsx
        // Celebrate with a sparkled achievement message
        const stats = [`+${xpGained} XP`, `🔥 ${newStreak} day streak`];
        if (newStreak > profileData.longestStreak) stats.push('🏆 New record!');
        setAchievement({ stats });
        return;
```
with:
```tsx
        // Celebrate with a sparkled achievement message
        const newLevel = computeLevel(newXp);
        const leveledUp = newLevel > profileData.level;
        const streakMilestone = newStreak > 0 && (newStreak % 7 === 0 || newStreak === 100);

        const stats = [`+${xpGained} XP`, `🔥 ${newStreak} day streak`];
        if (newStreak > profileData.longestStreak) stats.push('🏆 New record!');
        if (leveledUp) stats.push(`⭐ Level ${newLevel}!`);

        setAchievement({ stats, celebrate: leveledUp || streakMilestone });
        return;
```

And update the `AchievementOverlay` render to pass the new field through:
```tsx
      <AchievementOverlay
        open={!!achievement}
        title="Workout Complete!"
        message="You showed up and put in the work. Proud of you!"
        stats={achievement?.stats ?? []}
        celebrate={achievement?.celebrate ?? false}
        onClose={() => {
          setAchievement(null);
          onComplete();
        }}
      />
```

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Use `mcp__supabase__execute_sql` to set the test profile's `currentStreak` to `6` and `lastSessionDate` to yesterday's date, then complete a session via the `/session` flow through to submission — this should push the streak to 7 (a milestone), confirm the fireworks canvas renders behind the achievement card. Then repeat with a streak that won't hit a multiple of 7 or a level boundary, and confirm fireworks do *not* render (just the existing sparkled achievement card).

- [ ] **Step 6: Commit**

```bash
git add components/kokonutui/fireworks-background.tsx components/AchievementOverlay.tsx app/session/_components/CompletionTracker.tsx
git commit -m "feat: add fireworks celebration for level-ups and streak milestones"
```

---

### Task 14: Goals page motion carousel

**Files:**
- Create: `components/kokonutui/motion-carousel.tsx`
- Modify: `app/goals/page.tsx`

**Interfaces:**
- Produces: `MotionCarousel({ slides }: { slides: React.ReactNode[] })` — Embla-powered carousel with Framer Motion active-slide scaling and pill-style pagination dots.

- [ ] **Step 1: Write the component**

```tsx
// components/kokonutui/motion-carousel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function MotionCarousel({ slides }: { slides: React.ReactNode[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "center" });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((slide, index) => (
            <motion.div
              key={index}
              className="min-w-0 shrink-0 grow-0 basis-full px-1"
              animate={{ scale: index === selectedIndex ? 1 : 0.94, opacity: index === selectedIndex ? 1 : 0.7 }}
              transition={{ duration: 0.3 }}
            >
              {slide}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => emblaApi?.scrollTo(index)}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              index === selectedIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Restructure `app/goals/page.tsx`**

Add the import: `import { MotionCarousel } from '@/components/kokonutui/motion-carousel';`

Replace the block from the goals-list/empty-state section through `<MealPlanWidget />` — i.e. replace:
```tsx
      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : goals.length > 0 ? (
        <GoalsList goals={goals} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Goals Set</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You haven&apos;t set any fitness goals yet. Start by adding your first goal.
            </p>
            <AddGoalForm onGoalAdded={handleGoalAdded} userId={userId!}  />
          </CardContent>
        </Card>
      )}

      {goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Add Another Goal</CardTitle>
          </CardHeader>
          <CardContent>
            <AddGoalForm onGoalAdded={handleGoalAdded}  userId={userId!}/>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WeightTracker userId={userId!} />
        <CalorieTracker userId={userId!} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FoodIntakeTracker userId={userId!} />
        <StaminaTracker userId={userId!} />
      </div>

      <MealPlanWidget />
```
with:
```tsx
      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : (
        <MotionCarousel
          slides={[
            <div key="goals-list" className="space-y-4">
              {goals.length > 0 ? (
                <GoalsList goals={goals} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Goals Set</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">
                      You haven&apos;t set any fitness goals yet. Start by adding your first goal.
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{goals.length > 0 ? 'Add Another Goal' : 'Add Your First Goal'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddGoalForm onGoalAdded={handleGoalAdded} userId={userId!} />
                </CardContent>
              </Card>
            </div>,
            <WeightTracker key="weight" userId={userId!} />,
            <CalorieTracker key="calorie" userId={userId!} />,
            <FoodIntakeTracker key="food" userId={userId!} />,
            <StaminaTracker key="stamina" userId={userId!} />,
            <MealPlanWidget key="meal-plan" />,
          ]}
        />
      )}
```

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

On `/goals`, confirm the page now renders as a single carousel (6 slides: goals list+add-goal, weight, calorie, food, stamina, meal plan), pagination dots below track the active slide, swiping/dragging moves between slides with the scale animation, and each slide's existing functionality still works (add a goal on slide 1, log a weight entry on slide 2, etc. — spot-check at least 2-3 slides).

- [ ] **Step 5: Commit**

```bash
git add components/kokonutui/motion-carousel.tsx app/goals/page.tsx
git commit -m "feat: restructure goals page as a motion carousel"
```
