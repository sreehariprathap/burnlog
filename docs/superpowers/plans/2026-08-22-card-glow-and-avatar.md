# Card Glow Effect & Profile Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert the Card primitive's liquid-glass styling (removed per user feedback — "looks ugly, barely distinguishable in dark mode") to plain styling with a pointer-tracked Glowing Effect border (Aceternity UI), and add a profile avatar (initials fallback, tap-to-upload via Supabase Storage).

**Architecture:** `GlowingEffect` is baked into the `Card` primitive the same way liquid glass was — one file changes, all 43 existing `<Card>` call sites upgrade automatically. Dead liquid-glass code (`GlassFilter`, unused `LiquidButton`, `--glass-shadow` CSS) is deleted. Avatar is a new self-contained `ProfileAvatar` component wired into `/profile`, backed by a new Supabase Storage bucket with owner-only-write RLS (same "any read, owner write" shape as `ai_model_settings`) and a new `Profile.avatarUrl` column.

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing via Chrome DevTools MCP (`http://127.0.0.1:3000`, test account `push-verify@example.com` / `PushVerify123!`).
- Schema changes via `npx prisma db push` (no migrations directory). RLS/Storage policies applied via `mcp__supabase__execute_sql`, then mirrored into `supabase/rls.sql` for version control (established repo convention).
- `--start` (used by the glow's rotating angle) must be registered via CSS `@property` for the browser to animate it smoothly — without this it snaps instantly instead of easing.
- The `GlowingEffect`'s `::after` pseudo-element (used for the actual glow border) is written as plain CSS in `app/globals.css`, not as a Tailwind arbitrary-value utility — the declaration mixes commas, custom properties, and multi-part `transition`/`mask` values that are fragile to express correctly through Tailwind's arbitrary-property bracket syntax.

---

### Task 1: Revert Card to plain styling, delete dead liquid-glass code

**Files:**
- Modify: `components/ui/card.tsx`
- Modify: `app/globals.css`
- Delete: `components/kokonutui/glass-filter.tsx`
- Delete: `components/kokonutui/liquid-button.tsx`

**Interfaces:**
- Produces: `Card` reverts to `border bg-card text-card-foreground shadow-sm` styling (matching its pre-glass appearance), keeps the same `glassSize`/`glassEffect` prop names (now `glassEffect` toggles the glow instead of glass, to avoid touching call sites) — the actual glow rendering is added in Task 2, this task only strips the glass styling and confirms nothing else references the deleted files.

- [ ] **Step 1: Confirm no other references before deleting**

Run: `grep -rln "GlassFilter\|LiquidButton" /Users/sreehariprathap/Documents/Cowork/Projects/burnlog/app /Users/sreehariprathap/Documents/Cowork/Projects/burnlog/components --include="*.tsx" | grep -v "glass-filter.tsx\|liquid-button.tsx"`
Expected: no output (confirms both are only self-referenced, safe to delete).

- [ ] **Step 2: Delete the dead files**

```bash
rm components/kokonutui/glass-filter.tsx components/kokonutui/liquid-button.tsx
```

- [ ] **Step 3: Revert `Card` to plain styling**

Replace the full contents of `components/ui/card.tsx`:

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

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
    /** Enables the pointer-tracked glowing border effect. Default true. */
    glassEffect?: boolean
  }

function Card({ className, glassSize, glassEffect = true, style, children, ...rest }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        cardVariants({ glassSize }),
        className
      )}
      style={style}
      {...rest}
    >
      {children}
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

(`GlowingEffect` is added back into this same function in Task 2 — this step intentionally leaves the glow out so the "plain card, no effect" state can be verified in isolation first.)

- [ ] **Step 4: Remove `--glass-shadow` from `app/globals.css`**

Remove this line from the `:root` block:
```css
  --glass-shadow: inset 1px 1px 0 0 rgba(255,255,255,0.5), inset -1px -1px 1px 0 rgba(255,255,255,0.3), inset 0 0 8px 1px rgba(255,255,255,0.25), 0 4px 12px rgba(0,0,0,0.08);
```

And this line from the `.dark` block:
```css
  --glass-shadow: inset 1px 1px 0 0 rgba(255,255,255,0.1), inset -1px -1px 1px 0 rgba(0,0,0,0.4), inset 0 0 8px 1px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.35);
```

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors (this confirms no other file still imports the deleted `GlassFilter`/`LiquidButton`).

Run: `npm run dev` (if not already running), visit `http://127.0.0.1:3000/dashboard`, confirm cards render with plain borders/background (no blur, no distortion), in both light and dark mode.

- [ ] **Step 6: Commit**

```bash
git add components/ui/card.tsx app/globals.css
git rm components/kokonutui/glass-filter.tsx components/kokonutui/liquid-button.tsx
git commit -m "fix: revert Card to plain styling, remove dead liquid-glass code"
```

---

### Task 2: Glowing Effect component, wired into Card

**Files:**
- Create: `components/kokonutui/glowing-effect.tsx`
- Modify: `app/globals.css`
- Modify: `components/ui/card.tsx`

**Interfaces:**
- Produces: `GlowingEffect({ blur, inactiveZone, proximity, spread, variant, glow, className, disabled, movementDuration, borderWidth }: GlowingEffectProps)` — renders a pointer-tracked glowing border as an absolutely-positioned overlay filling its nearest positioned ancestor. `Card` renders `<GlowingEffect disabled={!glassEffect} />` as its first child.

- [ ] **Step 1: Register `--start` as an animatable angle property**

Add to `app/globals.css`, after the `@custom-variant dark` line near the top (outside any `@layer` block — `@property` must be top-level):

```css
@property --start {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
```

- [ ] **Step 2: Add the glow's pseudo-element CSS**

Add to `app/globals.css`, after the `@layer base { ... }` block:

```css
.glowing-effect-glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.glowing-effect-glow::after {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--glowingeffect-border-width));
  border: var(--glowingeffect-border-width) solid transparent;
  background: var(--gradient);
  opacity: var(--active);
  transition: --start var(--movement-duration) linear, opacity 300ms ease;
  mask-clip: padding-box, border-box;
  mask-composite: intersect;
  mask-image:
    linear-gradient(#0000, #0000),
    conic-gradient(
      from calc((var(--start) - var(--spread)) * 1deg),
      #00000000 0deg,
      #fff,
      #00000000 calc(var(--spread) * 2deg)
    );
}

.glowing-effect-glow.glow::after {
  opacity: 1;
}
```

- [ ] **Step 3: Write the component**

```tsx
// components/kokonutui/glowing-effect.tsx
"use client";

import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

function GlowingEffectComponent({
  blur = 0,
  inactiveZone = 0.7,
  proximity = 0,
  spread = 20,
  variant = "default",
  glow = false,
  className,
  disabled = true,
  movementDuration = 2,
  borderWidth = 1,
}: GlowingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef(0);

  useEffect(() => {
    if (disabled) return;
    const element = containerRef.current;
    if (!element) return;

    const handlePointerMove = (e: PointerEvent) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const distanceFromCenter = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

      const withinProximity =
        e.clientX > left - proximity &&
        e.clientX < left + width + proximity &&
        e.clientY > top - proximity &&
        e.clientY < top + height + proximity;

      if (distanceFromCenter < inactiveRadius || !withinProximity) {
        element.style.setProperty("--active", "0");
        return;
      }

      element.style.setProperty("--active", "1");

      const targetAngle =
        (180 * Math.atan2(e.clientY - centerY, e.clientX - centerX)) / Math.PI + 90;
      // Shortest angular path so the transition never spins the long way around.
      const delta = (((targetAngle - lastAngleRef.current + 180) % 360) + 360) % 360 - 180;
      const newAngle = lastAngleRef.current + delta;
      lastAngleRef.current = newAngle;
      element.style.setProperty("--start", `${newAngle}deg`);
    };

    document.body.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => document.body.removeEventListener("pointermove", handlePointerMove);
  }, [disabled, inactiveZone, proximity]);

  const gradient =
    variant === "white"
      ? "repeating-conic-gradient(from 236.84deg at 50% 50%, var(--foreground), var(--foreground) calc(25% / var(--repeating-conic-gradient-times)))"
      : `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%),
         radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%),
         radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%),
         radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%),
         repeating-conic-gradient(
           from 236.84deg at 50% 50%,
           #dd7bbb 0%,
           #d79f1e calc(25% / var(--repeating-conic-gradient-times)),
           #5a922c calc(50% / var(--repeating-conic-gradient-times)),
           #4c7894 calc(75% / var(--repeating-conic-gradient-times)),
           #dd7bbb calc(100% / var(--repeating-conic-gradient-times))
         )`;

  if (disabled) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={
        {
          "--spread": spread,
          "--start": "0deg",
          "--active": "0",
          "--glowingeffect-border-width": `${borderWidth}px`,
          "--repeating-conic-gradient-times": "5",
          "--gradient": gradient,
          "--movement-duration": `${movementDuration}s`,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
        } as React.CSSProperties
      }
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
    >
      <div className={cn("glowing-effect-glow", glow && "glow")} />
    </div>
  );
}

export const GlowingEffect = memo(GlowingEffectComponent);
```

- [ ] **Step 4: Wire into `Card`**

In `components/ui/card.tsx`, add the import:
```tsx
import { GlowingEffect } from "@/components/kokonutui/glowing-effect"
```

Change the `Card` function body from:
```tsx
    >
      {children}
    </div>
  )
}
```
to:
```tsx
    >
      <GlowingEffect disabled={!glassEffect} />
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `http://127.0.0.1:3000/dashboard`, move the mouse near/over a few cards, confirm a colorful glowing border appears and tracks the pointer, fading out when the pointer moves away or over the card's center (per `inactiveZone`). Confirm this looks correct in both light and dark mode, and that it's visually distinct from the (now removed) glass effect. Confirm the floating dock nav is unaffected (it's not built from `Card`).

- [ ] **Step 6: Commit**

```bash
git add components/kokonutui/glowing-effect.tsx app/globals.css components/ui/card.tsx
git commit -m "feat: add pointer-tracked Glowing Effect to the Card primitive"
```

---

### Task 3: Avatar data model + Supabase Storage bucket

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Produces: `Profile.avatarUrl String?` column. New public-read Storage bucket `avatars` with RLS restricting writes to the caller's own `{userId}/...` path prefix.

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, add to the `Profile` model (after `lastSessionDate`):
```prisma
  avatarUrl       String?
```

- [ ] **Step 2: Push the schema**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Create the bucket and RLS policies**

Using `mcp__supabase__execute_sql`:
```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 4: Mirror into `supabase/rls.sql`**

Append to `supabase/rls.sql`, after the `ai_model_settings` section:
```sql

-- avatars storage bucket ------------------------------------------------
-- Public read (avatars are just profile pictures); writes restricted to
-- objects under the caller's own auth.uid() folder, e.g. avatars/{uid}/*.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 5: Verify**

Using `mcp__supabase__execute_sql`:
```sql
select id, public from storage.buckets where id = 'avatars';
select policyname from pg_policies where tablename = 'objects' and policyname like 'avatars_%';
```
Expected: one bucket row (`public = true`), 4 policies listed.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add Profile.avatarUrl and avatars Storage bucket with owner-write RLS"
```

---

### Task 4: Avatar UI

**Files:**
- Modify: `package.json` (add `@radix-ui/react-avatar`)
- Create: `components/ui/avatar.tsx`
- Create: `app/profile/_components/ProfileAvatar.tsx`
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Produces: `Avatar`/`AvatarImage`/`AvatarFallback` (standard shadcn primitives). `ProfileAvatar({ userId, firstName, lastName, avatarUrl, onUploaded }: { userId: string; firstName: string; lastName: string; avatarUrl: string | null; onUploaded: (url: string) => void })` — tap-to-upload circular avatar with initials fallback.

- [ ] **Step 1: Install the Radix primitive**

Run: `npm install @radix-ui/react-avatar`
Expected: added to `package.json`, no errors.

- [ ] **Step 2: Write the shadcn Avatar wrapper**

```tsx
// components/ui/avatar.tsx
"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
```

- [ ] **Step 3: Write `ProfileAvatar`**

```tsx
// app/profile/_components/ProfileAvatar.tsx
'use client';

import { useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Loader2 } from 'lucide-react';

const AVATAR_COLORS = ['#F97316', '#FBBF24', '#EF4444', '#FF9E4F', '#B55233'];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

type ProfileAvatarProps = {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  onUploaded: (url: string) => void;
};

export function ProfileAvatar({ userId, firstName, lastName, avatarUrl, onUploaded }: ProfileAvatarProps) {
  const supabase = createClientComponentClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatarUrl: publicUrl })
        .eq('userId', userId);

      if (updateError) throw updateError;

      onUploaded(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="relative"
        aria-label="Change profile photo"
      >
        <Avatar className="size-24 border-2 border-primary/20">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={`${firstName} ${lastName}`} />}
          <AvatarFallback
            className="text-2xl font-semibold text-white"
            style={{ backgroundColor: colorForName(`${firstName}${lastName}`) }}
          >
            {initialsFor(firstName, lastName)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Wire into `app/profile/page.tsx`**

Add the import:
```tsx
import { ProfileAvatar } from './_components/ProfileAvatar';
```

Add a `userId` state variable next to the other `useState` calls:
```tsx
  const [userId, setUserId] = useState<string | null>(null);
```

In the effect, right after `setEmail(session.user.email || null);`, add:
```tsx
        setUserId(session.user.id);
```

Add `avatarUrl` to the profile select query — change:
```tsx
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level')
```
to:
```tsx
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,avatarUrl')
```

Replace the "Large name display" block:
```tsx
            {/* Large name display */}
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-bold tracking-tight">{`${profile.firstName} ${profile.lastName}`}</h1>
            </div>
```
with:
```tsx
            {/* Avatar + large name display */}
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              {userId && (
                <ProfileAvatar
                  userId={userId}
                  firstName={profile.firstName}
                  lastName={profile.lastName}
                  avatarUrl={profile.avatarUrl ?? null}
                  onUploaded={(url) => setProfile((prev: any) => ({ ...prev, avatarUrl: url }))}
                />
              )}
              <h1 className="text-3xl font-bold tracking-tight">{`${profile.firstName} ${profile.lastName}`}</h1>
            </div>
```

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `http://127.0.0.1:3000/profile`, confirm a circular initials avatar (e.g. "PV" for the test account) renders above the name in an on-brand color, with a small camera badge. Tap it, select an image file, confirm an upload spinner shows then the photo appears in the avatar. Reload the page and confirm the photo persists (not reverted to initials). Upload a second photo and confirm it replaces the first (check via `mcp__supabase__execute_sql`: `select name from storage.objects where bucket_id = 'avatars';` — should show exactly one object per user, not accumulating duplicates).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/ui/avatar.tsx app/profile/_components/ProfileAvatar.tsx app/profile/page.tsx
git commit -m "feat: add profile avatar with initials fallback and tap-to-upload"
```
