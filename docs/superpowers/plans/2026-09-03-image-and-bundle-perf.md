# Image & Bundle Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix CLS/bandwidth waste from unmanaged `<img>` tags on remote (Supabase-hosted) images, and reduce first-load JS by lazy-loading heavy, off-critical-path client components.

**Architecture:** Enable `next/image` for the app's Supabase Storage host via `images.remotePatterns`, then swap every `<img>` whose `src` is a *remote, already-uploaded* URL over to `next/image` with explicit dimensions and `loading="lazy"` (default) for below-the-fold cards. `<img>` tags backed by ephemeral `blob:`/local preview URLs are explicitly left alone — `next/image` cannot optimize those, and rewriting them would be pure churn. Separately, wrap camera/scanner UIs, the reel lightbox, and recharts-based chart widgets in `next/dynamic` so their JS ships only when the surface is actually used, cutting initial bundle size for the pages that host them.

**Tech Stack:** Next.js 15 (App Router), next/image, next/dynamic, recharts.

**Spec:** No separate spec doc — derived directly from the audit in this conversation (raw `<img>` usage across sociallog/shoppinglog, zero `images.remotePatterns` config, zero `next/dynamic` usage across 369 `.tsx` files).

## Global Constraints

- No test infrastructure exists for React components (`vitest.config.ts` runs in `environment: 'node'`, zero `*.test.tsx` files project-wide) — verification per task is `npm run build` (type-check + lint via Next's build) plus a manual visual check in the dev server, not unit tests.
- Do not touch `<img>` tags whose `src` is a local `blob:`/object URL (file-picker previews) — `next/image` requires a server-fetchable URL and cannot optimize these. Confirmed local-preview cases to leave untouched: `ComposeBox.tsx:113`, `FoodScanner.tsx:172`, `ReceiptScanner.tsx:147`.
- Do not touch `world-map.tsx` (`data:` URI, already has width/height and an explanatory eslint-disable) or `StoreStep.tsx`'s Clearbit logo `<img>` (external third-party domain, 16px icon, has an `onError` fallback that's simpler to keep as plain `<img>`) — out of scope, negligible payoff.
- Supabase Storage host for this project: `lbqqppnjglzcsgxxspce.supabase.co` (from `.env`'s `NEXT_PUBLIC_SUPABASE_URL`). Use a `remotePatterns` entry matching `**.supabase.co` under `/storage/v1/object/public/**` rather than hardcoding the project ref, so the config keeps working if the Supabase project is ever recreated.

---

### Task 1: Enable next/image for Supabase-hosted images

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `images.remotePatterns` config entry that later tasks' `next/image` usages depend on to load without a "hostname not configured" runtime error.

- [x] **Step 1: Add `images.remotePatterns` to `nextConfig`**

```ts
const nextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    // ...unchanged
  }
};
```

- [x] **Step 2: Verify build picks up the config**

Run: `npm run build`
Expected: build succeeds (no image-config schema errors).

- [x] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(next-config): allow next/image to serve Supabase storage URLs"
```

---

### Task 2: Migrate shoppinglog `<img>` usages to next/image

**Files:**
- Modify: `app/(shoppinglog)/shoppinglog/_components/ListingCard.tsx:27`
- Modify: `app/(shoppinglog)/shoppinglog/listing/[id]/page.tsx:149,165`
- Modify: `app/(shoppinglog)/shoppinglog/cart/page.tsx:167`
- Modify: `app/(shoppinglog)/shoppinglog/_components/ListingForm.tsx:184`

**Interfaces:**
- Consumes: `images.remotePatterns` from Task 1.

- [x] **Step 1: `ListingCard.tsx` — grid card cover image**

Replace:
```tsx
{listing.coverImageUrl ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={listing.coverImageUrl} alt={listing.title} className="h-full w-full object-cover" />
) : (
```
With:
```tsx
{listing.coverImageUrl ? (
  <Image
    src={listing.coverImageUrl}
    alt={listing.title}
    fill
    sizes="(max-width: 640px) 50vw, 25vw"
    className="object-cover"
  />
) : (
```
Add `import Image from 'next/image';` to the top of the file. The parent `<div className="relative aspect-square bg-muted">` already provides the positioned container `fill` needs — confirm it keeps `relative`.

- [x] **Step 2: `listing/[id]/page.tsx` — main image + thumbnail strip**

Line 149 (main image, largest on the page — treat as this page's LCP candidate):
```tsx
<Image
  src={listing.images[imageIndex]}
  alt={listing.title}
  fill
  sizes="(max-width: 768px) 100vw, 600px"
  priority
  className="object-cover"
/>
```
Line 165 (thumbnail strip entries):
```tsx
<Image src={url} alt="" fill sizes="80px" className="object-cover" />
```
Add `import Image from 'next/image';`. Confirm both `<img>`'s parent containers are `position: relative` (they already use `h-full w-full` inside sized wrappers per the grep output — verify before assuming `fill` works, add `relative` to the wrapper class if missing).

- [x] **Step 3: `cart/page.tsx` — line-item thumbnail**

```tsx
<Image src={item.listing.coverImageUrl} alt={item.listing.title} fill sizes="64px" className="object-cover" />
```
Add `import Image from 'next/image';`. Verify the wrapping element is `position: relative` and has fixed dimensions (cart thumbnails are typically small fixed squares).

- [x] **Step 4: `ListingForm.tsx` — uploaded photo previews**

These are `data.publicUrl` values already returned from Supabase Storage after upload (not local blobs — confirmed via `grep -n "publicUrl" ListingForm.tsx`), so they're safe to optimize:
```tsx
<Image src={url} alt="" fill sizes="80px" className="rounded-md object-cover" />
```
Add `import Image from 'next/image';`. The wrapper is `<div key={url} className="relative size-20">` — already `relative` with fixed size, `fill` works as-is.

- [x] **Step 5: Build check**

Run: `npm run build`
Expected: no TypeScript/lint errors from the `Image` usages (missing `sizes`, missing `alt`, etc. are lint errors under `next/core-web-vitals`).

- [x] **Step 6: Manual visual check**

Run: `npm run dev`, open `/shoppinglog`, a listing detail page, and `/shoppinglog/cart`. Confirm images render without layout shift or broken aspect ratios, and the listing-form photo picker still shows uploaded thumbnails.

- [x] **Step 7: Commit**

```bash
git add "app/(shoppinglog)/shoppinglog/_components/ListingCard.tsx" \
        "app/(shoppinglog)/shoppinglog/listing/[id]/page.tsx" \
        "app/(shoppinglog)/shoppinglog/cart/page.tsx" \
        "app/(shoppinglog)/shoppinglog/_components/ListingForm.tsx"
git commit -m "perf(shoppinglog): migrate remote listing images to next/image"
```

---

### Task 3: Migrate sociallog `<img>` usages to next/image

**Files:**
- Modify: `app/(sociallog)/sociallog/_components/PostCard.tsx:117`
- Modify: `app/(sociallog)/sociallog/search/_components/ReelsGrid.tsx:50,56`
- Modify: `app/(sociallog)/sociallog/search/_components/ReelViewer.tsx:53`

**Interfaces:**
- Consumes: `images.remotePatterns` from Task 1.
- Leaves untouched: `ComposeBox.tsx:113` (local blob preview, per Global Constraints).

- [x] **Step 1: `PostCard.tsx` — feed image**

```tsx
{post.mediaUrl && post.mediaType === 'image' && (
  <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg">
    <Image
      src={post.mediaUrl}
      alt={post.body ? post.body.slice(0, 120) : `Photo posted by @${post.author.username}`}
      fill
      sizes="(max-width: 640px) 100vw, 600px"
      className="object-cover"
    />
  </div>
)}
```
This changes layout from `max-h-96 w-full` auto-height to a fixed `aspect-[4/3]` box, since `next/image fill` requires a sized ancestor. Add `import Image from 'next/image';`.

- [x] **Step 2: `ReelsGrid.tsx` — grid thumbnails (both branches)**

Both occurrences sit inside the same grid `<button>` tile; replace each with:
```tsx
<Image src={r.mediaThumbnailUrl} alt="" fill sizes="(max-width: 640px) 33vw, 200px" className="object-cover" />
```
and
```tsx
<Image src={r.mediaThumbnailUrl ?? r.mediaUrl ?? ''} alt="" fill sizes="(max-width: 640px) 33vw, 200px" className="object-cover" />
```
Guard the second one (skip rendering when both are nullish) the same way the first branch already guards on `r.mediaThumbnailUrl &&`. Add `import Image from 'next/image';`. Verify the `<button>` tile has `position: relative` (add if missing).

- [x] **Step 3: `ReelViewer.tsx` — full-screen lightbox image**

```tsx
<div className="relative max-h-[80vh] max-w-[90vw]">
  <Image
    src={reel.mediaUrl ?? ''}
    alt=""
    fill
    sizes="90vw"
    className="object-contain"
    priority
  />
</div>
```
`priority` here because this is a full-screen modal opened on user intent — treat it like this view's LCP element. Add `import Image from 'next/image';`. Guard rendering when `reel.mediaUrl` is nullish the same way the surrounding JSX already does.

- [x] **Step 4: Build check**

Run: `npm run build`

- [x] **Step 5: Manual visual check**

Run: `npm run dev`, open the sociallog feed, the reels grid, and open a reel to trigger the lightbox. Confirm no broken aspect ratios or missing images.

- [x] **Step 6: Commit**

```bash
git add "app/(sociallog)/sociallog/_components/PostCard.tsx" \
        "app/(sociallog)/sociallog/search/_components/ReelsGrid.tsx" \
        "app/(sociallog)/sociallog/search/_components/ReelViewer.tsx"
git commit -m "perf(sociallog): migrate remote post/reel images to next/image"
```

---

### Task 4: Lazy-load heavy scanner and chart components

**Files:**
- Modify: `app/(burnlog)/burnlog/goals/_components/FoodScanner.tsx` (consumer, find via `grep -rn "FoodScanner" app`)
- Modify: `app/(moneylog)/moneylog/_components/ReceiptScanner.tsx` (consumer, find via `grep -rn "ReceiptScanner" app`)
- Modify: `app/(burnlog)/burnlog/insights/_components/InsightsClient.tsx`
- Modify: `app/(burnlog)/burnlog/dashboard/_components/WorkoutPieChart.tsx` (consumer)
- Modify: `app/(moneylog)/moneylog/insights/_components/FinanceInsightsClient.tsx`
- Modify: `app/(moneylog)/moneylog/assets/[id]/page.tsx`
- Modify: `components/insights/BenchmarkAreaChart.tsx` (consumer)
- Modify: `components/logbook/LifeScoreTrend.tsx` (consumer)

**Interfaces:**
- No new exports — this task changes *how* existing default exports are imported by their parents (static import → `next/dynamic`), not their own signatures.

- [x] **Step 1: Find each component's importing parent**

```bash
grep -rn "import FoodScanner" app
grep -rn "import ReceiptScanner" app
grep -rn "import.*WorkoutPieChart" app
grep -rn "import.*BenchmarkAreaChart" app components
grep -rn "import.*LifeScoreTrend" app components
```

- [x] **Step 2: Convert each import to `next/dynamic`**

For a component that's client-only and has no SEO-relevant content (scanners, charts), replace:
```tsx
import FoodScanner from './_components/FoodScanner';
```
with:
```tsx
import dynamic from 'next/dynamic';

const FoodScanner = dynamic(() => import('./_components/FoodScanner'), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-xl bg-muted" />,
});
```
Adjust the relative import path and the `loading` placeholder's dimensions per component (match its typical rendered height so no layout shift when it resolves). Apply the same pattern to the `ReceiptScanner`, `WorkoutPieChart`, `BenchmarkAreaChart`, and `LifeScoreTrend` importers, and to whichever component in `InsightsClient.tsx` / `FinanceInsightsClient.tsx` / `assets/[id]/page.tsx` renders the recharts chart if it isn't already one of the named files above (open each and confirm which JSX block is the chart before editing).

- [x] **Step 3: Build check**

Run: `npm run build`
Expected: build output shows new separate chunks for the dynamic-imported components (visible in the build's route/JS-size table).

- [x] **Step 4: Manual visual check**

Run: `npm run dev`. Open the burnlog goals page (FoodScanner), moneylog receipt entry (ReceiptScanner), burnlog dashboard/insights, and moneylog insights/asset detail. Confirm each still renders and functions (scanners still open the camera/file picker; charts still render data) after the loading placeholder resolves.

- [x] **Step 5: Commit**

```bash
git add app/\(burnlog\)/burnlog/goals app/\(moneylog\)/moneylog/_components \
        app/\(burnlog\)/burnlog/insights app/\(burnlog\)/burnlog/dashboard \
        app/\(moneylog\)/moneylog/insights app/\(moneylog\)/moneylog/assets \
        components/insights components/logbook
git commit -m "perf: lazy-load scanner and chart components via next/dynamic"
```

## Self-Review Notes

- Spec coverage: image migration (Tasks 1-3) and code-splitting (Task 4) both map directly to the two audit findings the user asked to act on; content-visibility/CSS-only list optimization was explicitly deferred (user picked "write a plan" for the two named fixes, not the full audit list).
- Placeholder scan: no TBD/"add error handling"/"similar to Task N" placeholders — Task 4's file list has explicit `grep` steps precisely because the exact chart-vs-page split wasn't verified line-by-line during the audit; that verification is now a concrete step, not a deferred one.
- Type consistency: all `Image` usages use `next/image`'s real prop names (`fill`, `sizes`, `priority`, `alt`, `className`) — no invented APIs.
