# Capacitor Mobile Wrapper (Phase 1)

## Goal

Ship installable iOS and Android apps for burnlog with minimum engineering effort, by wrapping the existing deployed web app rather than porting it. No changes to `app/`, business logic, or the Vercel deploy pipeline.

Distribution target for this phase: personal/internal builds only (sideload / simulator / device install via Xcode & Android Studio) — no App Store or Play Store submission.

Native push notifications are explicitly out of scope for this phase; tracked as a separate follow-up spec once this wrapper is working.

## Approach: Capacitor in "live URL" mode

burnlog is server-rendered (Next.js middleware performs Supabase auth checks via cookies on every request), so a static export is not viable. Capacitor is configured with `server.url` pointing at the production deployment (`https://burnlog-green.vercel.app`), so the native shell always loads whatever is currently live — normal web deploys just work, no native rebuild/resubmission required for web-only changes.

Because the WebView loads the real HTTPS origin (not a bundled snapshot), the existing Supabase cookie-based auth flow works unmodified — sessions persist across app relaunch the same way they would in a mobile browser tab.

## New pieces added to the repo

- `capacitor.config.ts` (repo root) — `appId: com.burnlog.app`, `appName: burnlog`, `webDir` pointing at a new minimal local directory (see Offline handling), `server.url: https://burnlog-green.vercel.app`, `server.errorPath` pointing at the local offline fallback.
- `ios/` — Xcode project generated via `npx cap add ios`. Requires a Mac + Xcode to build/run.
- `android/` — Android Studio project generated via `npx cap add android`.
- New devDependencies: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`.
- New minimal runtime plugins:
  - `@capacitor/app` — Android hardware back button navigates the WebView back instead of exiting the app.
  - `@capacitor/splash-screen` — shows `public/burnlog-icon-splash.png` while the WebView loads the remote URL.
  - `@capacitor/status-bar` — sets status bar color to `#3b82f6` (matches `app/manifest.ts` theme_color).
- New npm scripts: `cap:sync`, `cap:open:ios`, `cap:open:android`.
- App icons for both platforms generated from `public/icons/icon-512.png` via the `@capacitor/assets` CLI (one command, no manual resizing).

## Offline handling

Two independent pieces, since Capacitor's WebView does not run the site's `next-pwa` service worker the way a browser tab does:

- **Web PWA**: already handled, no changes needed. `worker/index.js`'s `setCatchHandler` serves `app/offline/page.tsx` (via cached `/offline` route) when a document fetch fails.
- **Capacitor**: the local `webDir` becomes a single static `offline.html` (plain HTML/CSS, visually mirroring `app/offline/page.tsx` — cannot reuse the React page directly since it isn't part of a static bundle) with a "Try Again" button that reloads `server.url`. `capacitor.config.ts`'s `server.errorPath` points failed loads here instead of Capacitor's default raw connection-error screen.

## Explicitly out of scope (this phase)

- Native push notifications (FCM/APNs setup, backend changes) — separate follow-up spec.
- App Store / Play Store submission (signing, provisioning profiles, store listings, screenshots, review).
- Any new native plugins beyond back-button/splash/status-bar (camera, native storage, biometrics, etc.).
- Reactive connectivity detection (`@capacitor/network`) — the static offline fallback is sufficient for this phase.

## Testing (manual smoke test, no automated suite)

Since this wraps an already-tested web app, verification is manual on both platforms:

1. Build & launch on iOS Simulator and an Android emulator.
2. Log in; relaunch the app; confirm the session persists (cookie-based auth survives in the WebView).
3. Navigate core flows (dashboard, SocialLog, ShoppingLog) — confirm no layout/behavior breakage vs. browser.
4. Android hardware back button navigates within the app instead of exiting.
5. Splash screen and app icon render correctly on both platforms.
6. Enable airplane mode before launch — confirm `offline.html` shows (not a blank/raw error), and "Try Again" recovers once reconnected.
