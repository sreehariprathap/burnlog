// lib/ui/navShell.ts
//
// The floating pill wrapper every per-app bottom nav renders. Was 12
// byte-identical literal className strings; consolidated here so the
// glass UI toggle (.surface-nav, see app/globals.css) only needs to
// change once. Zero visual change from consolidating this by itself.
export const NAV_SHELL_CLASS =
  'fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full surface-nav px-2 py-2';
