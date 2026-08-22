# Card Glow Effect & Profile Avatar — Design

## Problem

User feedback on the liquid-glass overhaul: the glass effect on cards looks bad, especially in dark mode where the translucent/blurred background is barely distinguishable from the page background. The floating dock nav is explicitly fine as-is and stays untouched. Cards should instead get [Aceternity UI's Glowing Effect](https://ui.aceternity.com/components/glowing-effect) — a pointer-tracked glowing border, inspired by Cursor's Enterprise page. Separately, the profile page has no avatar at all; add one.

## 1. Card: revert liquid glass, add Glowing Effect

`components/ui/card.tsx` reverts to plain styling — the same `bg-card text-card-foreground border shadow-sm` look it had before the liquid-glass work, dropping `backdrop-blur`, the `--glass-shadow` CSS variable usage, and the `GlassFilter` SVG displacement filter entirely (that component and the `--glass-shadow` custom properties in `app/globals.css` are removed as dead code — nothing else references them, since Card was the only consumer).

New file `components/kokonutui/glowing-effect.tsx`, ported from the Aceternity spec:
```
Props: blur (0), inactiveZone (0.7), proximity (0), spread (20),
       variant ('default' | 'white'), glow (false), disabled (true),
       movementDuration (2), borderWidth (1), className
```
Tracks pointer position via `pointermove` against the nearest positioned ancestor, rotates a conic-gradient border (multi-color for `'default'`, monochrome for `'white'`) toward the cursor using CSS custom properties, animated via `requestAnimationFrame` for smooth tracking (matches the "Cursor's Enterprise page" reference behavior — a glow that follows the mouse along the card's border, fading in near the edges and out toward the center per `inactiveZone`).

`Card` bakes this in by default (same "baked into the primitive, zero call-site changes" approach used for the liquid glass work) — the existing `glassEffect?: boolean` prop is repurposed to mean "glow effect enabled" (default `true`), so nothing needs renaming at any of the 43 existing `<Card>` usages. `glassSize` (padding variant) stays as-is, unrelated to the glow work.

## 2. Profile avatar

**Data model**: `prisma/schema.prisma`'s `Profile` model gains `avatarUrl String?`, pushed via `npx prisma db push` (this repo's established schema-change method — no migrations directory).

**Storage**: new Supabase Storage bucket `avatars`, public read (avatars are just profile pictures, no sensitivity), with a storage RLS policy restricting *uploads/updates/deletes* to paths prefixed with the caller's own `auth.uid()` (e.g. objects stored at `avatars/{userId}/avatar.jpg`) — same "any authenticated read, owner-only write" shape already established for `ai_model_settings`, applied to Storage objects instead of a table.

**UI**:
- New `components/ui/avatar.tsx` — standard shadcn wrapper around Radix `Avatar`/`AvatarImage`/`AvatarFallback` (not yet present in this repo).
- On `/profile`, a circular avatar is placed directly above the existing `{firstName} {lastName}` heading. Shows `<AvatarImage src={avatarUrl} />` when set; otherwise `<AvatarFallback>` renders the user's initials (e.g. "PV" for Push Verify) on a background color deterministically derived from their name (hashed into the app's existing amber/orange accent palette, so it's on-brand rather than random).
- Tapping the avatar opens a hidden file input (reusing `FoodScanner.tsx`'s established validated-file pattern: `image/*` accept, 10MB cap, `FileReader.readAsDataURL` for an instant local preview). On selection, the file uploads directly to the `avatars` bucket at `avatars/{userId}/avatar.<ext>` (upsert, so re-uploading replaces the old file), and `profiles.avatarUrl` is updated with the resulting public URL.

## Error handling & edge cases
- Upload failure (network, oversized file, wrong type) → inline error message near the avatar, previous avatar (or initials fallback) stays displayed — never left in a broken/blank state.
- No `avatarUrl` yet → initials fallback renders immediately, no loading flicker.
- Removing the liquid-glass CSS variables/`GlassFilter` component: confirmed via grep that `LiquidButton` (added in the earlier overhaul) is not imported anywhere in the app — it was never wired into any UI. Since it's the only other consumer of `--glass-shadow`/`GlassFilter`, and it's unused dead code itself, `components/kokonutui/liquid-button.tsx` is deleted in the same pass as `--glass-shadow` and `GlassFilter`, rather than left behind referencing removed dependencies.

## Testing
No automated test suite exists in this repo; manual verification in-browser:
- Confirm cards across dashboard/goals/profile render with plain backgrounds (light and dark mode) and the glow border tracks the pointer on hover, with clear contrast in both themes (the specific complaint about the old effect).
- Confirm the floating dock is visually unchanged.
- On `/profile`: confirm initials avatar renders correctly for the current name, upload a photo, confirm it displays and persists across a page reload, confirm a second upload replaces the first (not a duplicate file).
