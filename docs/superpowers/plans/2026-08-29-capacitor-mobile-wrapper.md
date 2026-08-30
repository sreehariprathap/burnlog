# Capacitor Mobile Wrapper (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship installable iOS and Android apps that wrap the existing deployed burnlog PWA, with no changes to `app/`, business logic, or the Vercel deploy pipeline.

**Architecture:** Capacitor configured in "live URL" mode — `capacitor.config.ts`'s `server.url` points at the production deployment, so the native WebView always loads whatever is currently live. A minimal local `webDir` exists only to satisfy Capacitor's requirement and to host a static `offline.html` shown when the remote URL fails to load.

**Tech Stack:** Capacitor 7.x (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/splash-screen`, `@capacitor/assets`), existing Next.js/Supabase web app (unchanged).

## Global Constraints

- App identifier: `com.burnlog.app`. App name: `burnlog`.
- Production URL Capacitor loads: `https://burnlog-green.vercel.app`.
- Distribution target: personal/internal builds only (sideload / simulator / device install) — no App Store or Play Store submission in this phase.
- No native push notifications in this phase (separate follow-up spec).
- No new native plugins beyond splash-screen (back-button and status-bar theming are achieved via Capacitor's built-in defaults / native resource config, not extra plugins — see Task 2/3 notes).
- Theme color for splash/status bar: `#3b82f6` (from `app/manifest.ts`).
- Source icon: `public/icons/icon-512.png`. Source splash image: `public/burnlog-icon-splash.png`.

---

## Task 0: Verify local native toolchains

Capacitor's `ios`/`android` platform commands need CocoaPods (iOS) and a full Xcode install, plus Android Studio + SDK (Android). This machine currently has only Xcode Command Line Tools — the full toolchain isn't installed yet. This task gets it in place before any Capacitor commands are run.

**Files:** None.

- [ ] **Step 1: Check current state**

Run: `xcode-select -p && pod --version; echo "---"; echo $ANDROID_HOME; ls "$HOME/Library/Android/sdk" 2>&1`
Expected (before setup): `xcode-select -p` prints a path, but `pod --version` errors with `command not found`, and the Android SDK path doesn't exist.

- [ ] **Step 2: Install full Xcode (manual, GUI)**

Open the App Store, install "Xcode" (not just Command Line Tools). This cannot be scripted — it's a multi-GB GUI install. After it finishes, run:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

Expected: no errors.

- [ ] **Step 3: Install CocoaPods**

```bash
brew install cocoapods
pod --version
```

Expected: prints a version number (e.g. `1.16.x`).

- [ ] **Step 4: Install Android Studio (manual, GUI)**

Download from https://developer.android.com/studio, install, open it once and let it run its first-time SDK setup wizard (installs the Android SDK, platform-tools, and a default emulator image). After that finishes, confirm the SDK path:

```bash
ls "$HOME/Library/Android/sdk"
```

Expected: lists folders like `platform-tools`, `platforms`, `emulator`.

- [ ] **Step 5: Point the shell at the Android SDK**

Add to `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Then: `source ~/.zshrc && echo $ANDROID_HOME`
Expected: prints the SDK path.

No commit for this task (no repo files changed).

---

## Task 1: Capacitor core install, config, and offline fallback page

**Files:**
- Modify: `package.json` (add dependencies + scripts)
- Create: `capacitor.config.ts`
- Create: `mobile/www/index.html`
- Create: `mobile/www/offline.html`

**Interfaces:**
- Produces: `mobile/www/` — the Capacitor `webDir`, consumed by `npx cap add`/`npx cap sync` in Tasks 2–3. `offline.html` is the file `capacitor.config.ts`'s `server.errorPath` points at.

- [ ] **Step 1: Install Capacitor core and CLI**

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
```

Expected: both added to `package.json` (`@capacitor/core` under `dependencies`, `@capacitor/cli` under `devDependencies`).

- [ ] **Step 2: Create the placeholder webDir index page**

Create `mobile/www/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>burnlog</title>
</head>
<body>
  <p>Loading burnlog…</p>
</body>
</html>
```

This is never actually shown to users — `server.url` takes over navigation immediately on launch — but Capacitor requires `webDir` to contain an `index.html` to initialize.

- [ ] **Step 3: Create the offline fallback page**

Create `mobile/www/offline.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>burnlog - Offline</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  @media (prefers-color-scheme: dark) { body { background: #111827; } }
  .card { text-align: center; padding: 2rem; }
  .icon {
    width: 6rem; height: 6rem; margin: 0 auto 1.5rem;
    background: #dbeafe; border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
  }
  @media (prefers-color-scheme: dark) { .icon { background: #1e3a8a; } }
  .icon svg { width: 3rem; height: 3rem; color: #2563eb; }
  h1 { font-size: 1.5rem; font-weight: 700; color: #111827; margin: 0 0 1rem; }
  @media (prefers-color-scheme: dark) { h1 { color: #ffffff; } }
  p { color: #4b5563; max-width: 28rem; margin: 0 auto 1.5rem; }
  @media (prefers-color-scheme: dark) { p { color: #9ca3af; } }
  button {
    background: #2563eb; color: #ffffff; font-weight: 500;
    padding: 0.5rem 1rem; border-radius: 0.5rem; border: none; cursor: pointer;
    font-size: 1rem;
  }
  button:hover { background: #1d4ed8; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.196l.707.707M12 21.804l-.707-.707M2.196 12l.707-.707M21.804 12l-.707.707" />
      </svg>
    </div>
    <h1>You're Offline</h1>
    <p>burnlog needs an internet connection to load. Check your connection and try again.</p>
    <button onclick="window.location.href='https://burnlog-green.vercel.app'">Try Again</button>
  </div>
</body>
</html>
```

Note (known Capacitor limitation, accepted for this phase): `server.errorPath` reliably catches hard network errors but not all failure modes (e.g. slow DNS/TLS stalls can leave a blank screen a bit longer before falling back). A more robust native-level fix is out of scope here — see the spec's "Explicitly out of scope" section.

- [ ] **Step 4: Create `capacitor.config.ts`**

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.burnlog.app',
  appName: 'burnlog',
  webDir: 'mobile/www',
  server: {
    url: 'https://burnlog-green.vercel.app',
    cleartext: false,
    androidScheme: 'https',
    errorPath: 'offline.html'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#3b82f6',
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false
    }
  }
};

export default config;
```

- [ ] **Step 5: Add npm scripts**

In `package.json`, add to `"scripts"`:

```json
"cap:sync": "cap sync",
"cap:open:ios": "cap open ios",
"cap:open:android": "cap open android"
```

- [ ] **Step 6: Verify the CLI reads the config**

Run: `npx cap sync`
Expected: output mentions `√ Copying web assets` and something like `no platforms found` (no `ios`/`android` folders yet — that's expected, they're added in Tasks 2–3). No config-parsing errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json capacitor.config.ts mobile/www/index.html mobile/www/offline.html
git commit -m "feat(mobile): add Capacitor config and offline fallback page"
```

---

## Task 2: Add and sync the iOS platform

**Files:**
- Create: `ios/` (generated Xcode project, committed to the repo)

**Interfaces:**
- Consumes: `capacitor.config.ts`, `mobile/www/` from Task 1.

- [ ] **Step 1: Install the iOS platform package**

```bash
npm install @capacitor/ios
```

- [ ] **Step 2: Add the iOS project**

```bash
npx cap add ios
```

Expected: creates `ios/App/` containing an Xcode workspace/project. If this fails with a CocoaPods error, go back to Task 0 Step 3.

- [ ] **Step 3: Sync**

```bash
npx cap sync ios
```

Expected: `√ Sync finished` with no errors; `mobile/www` contents copied into `ios/App/App/public`.

- [ ] **Step 4: Verify hardware/software back navigation needs no extra plugin**

No code change needed here — Capacitor's Android bridge handles the hardware back button by default (`webView.canGoBack()` → `goBack()`, else minimizes the app) without requiring the `@capacitor/app` plugin; that plugin is only needed if you want to intercept the event with custom JS, which isn't required for this phase. This step is a note, not an action — nothing to verify on iOS since iOS has no hardware back button. Skip to commit.

- [ ] **Step 5: Commit**

```bash
git add ios package.json package-lock.json
git commit -m "feat(mobile): add iOS platform via Capacitor"
```

---

## Task 3: Add and sync the Android platform

**Files:**
- Create: `android/` (generated Android Studio project, committed to the repo)
- Modify: `android/app/src/main/res/values/styles.xml` (status bar color)

**Interfaces:**
- Consumes: `capacitor.config.ts`, `mobile/www/` from Task 1.

- [ ] **Step 1: Install the Android platform package**

```bash
npm install @capacitor/android
```

- [ ] **Step 2: Add the Android project**

```bash
npx cap add android
```

Expected: creates `android/` with a Gradle project.

- [ ] **Step 3: Sync**

```bash
npx cap sync android
```

Expected: `√ Sync finished` with no errors.

- [ ] **Step 4: Set the status bar color natively**

The remote page's JS (your production site) never calls into `@capacitor/status-bar`, so status bar theming has to be set at the native resource level instead of via that plugin. Open `android/app/src/main/res/values/styles.xml` and set `colorPrimaryDark` to the theme color:

```xml
<item name="colorPrimaryDark">#3b82f6</item>
```

(Add this `<item>` inside the existing `AppTheme` / `AppTheme.NoActionBarLaunch` style block if not already present — check the file's current contents before editing, since the exact style name is generated by the Capacitor Android template.)

- [ ] **Step 5: Commit**

```bash
git add android package.json package-lock.json
git commit -m "feat(mobile): add Android platform via Capacitor, set status bar theme color"
```

---

## Task 4: Generate app icons and splash screens

**Files:**
- Create: `assets/icon.png` (source, copied from `public/icons/icon-512.png`)
- Create: `assets/splash.png` (source, copied from `public/burnlog-icon-splash.png`)
- Modify: generated icon/splash resources under `ios/App/App/Assets.xcassets/` and `android/app/src/main/res/`

**Interfaces:**
- Consumes: `ios/`, `android/` platforms from Tasks 2–3.

- [ ] **Step 1: Install the asset generator**

```bash
npm install -D @capacitor/assets
```

- [ ] **Step 2: Stage source images**

```bash
mkdir -p assets
cp public/icons/icon-512.png assets/icon.png
cp public/burnlog-icon-splash.png assets/splash.png
```

`@capacitor/assets` expects `assets/icon.png` and `assets/splash.png` by default and will upscale/pad as needed, but for best results the source icon should be at least 1024×1024 — verify:

```bash
sips -g pixelWidth -g pixelHeight assets/icon.png
```

Expected: width/height ≥ 512 (it is, since it's the existing 512×512 PWA icon — acceptable for this phase; note in the PR if quality looks soft on higher-density devices).

- [ ] **Step 3: Generate platform assets**

```bash
npx capacitor-assets generate
```

Expected: output confirms icons/splash generated for both `ios` and `android`; files appear under `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and `android/app/src/main/res/mipmap-*/`.

- [ ] **Step 4: Sync**

```bash
npx cap sync
```

Expected: `√ Sync finished`.

- [ ] **Step 5: Commit**

```bash
git add assets ios android
git commit -m "feat(mobile): generate app icons and splash screens"
```

---

## Task 5: Manual smoke test on both platforms

**Files:** None (verification only).

This wraps an already-tested web app, so verification is manual rather than automated. Requires the toolchain from Task 0 to be fully installed.

- [ ] **Step 1: Build and launch on iOS Simulator**

```bash
npx cap open ios
```

In Xcode, select an iPhone simulator target and press Run (⌘R).
Expected: app launches, shows the splash screen briefly, then loads the live burnlog site.

- [ ] **Step 2: Build and launch on an Android emulator**

```bash
npx cap open android
```

In Android Studio, select a running/created emulator and press Run.
Expected: same as above.

- [ ] **Step 3: Verify session persistence**

On either platform: log in, force-quit the app, relaunch.
Expected: still logged in (Supabase auth cookie persisted in the WebView).

- [ ] **Step 4: Verify core navigation**

Navigate to the dashboard, SocialLog, and ShoppingLog sections.
Expected: renders and behaves the same as in a mobile browser tab — no layout breakage.

- [ ] **Step 5: Verify Android back button**

On Android, navigate a couple of screens deep, then press the hardware back button.
Expected: navigates back within the app (browser-style history), doesn't exit the app until back at the root.

- [ ] **Step 6: Verify splash screen and icon**

Expected: app icon (from Task 4) shows on the home screen on both platforms; splash screen shows the configured background color (`#3b82f6`) briefly on launch.

- [ ] **Step 7: Verify offline fallback**

Enable airplane mode on the device/simulator, then launch (or relaunch) the app.
Expected: shows the `offline.html` page (not a blank screen or raw native error), with a working "Try Again" button. Disable airplane mode, tap "Try Again", confirm it recovers and loads the live site.

No commit for this task (verification only). If any step fails, file it as a follow-up fix before considering Phase 1 done.
