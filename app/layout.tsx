import type { Viewport } from "next";
import RootLayoutClient from "./RootLayoutClient";

// `viewport` must be exported from a Server Component — RootLayoutClient is
// "use client" (it needs useState for the Supabase client), so this thin
// server layout owns the viewport export and delegates rendering to it.
// Without this split, Next.js auto-injects its own default
// `<meta name="viewport">` ahead of any manually written one in a client
// component's JSX, and the browser silently uses the first tag it sees —
// which is how pinch-zoom and the iOS keyboard-covers-input bug crept in.
//
// `interactiveWidget` is "overlays-content" (keyboard floats over the page)
// rather than "resizes-content": resizing the layout viewport on keyboard
// show is what was causing WKWebView to reset scroll to (0,0) on focus.
// KeyboardFocusScroll (mounted in RootLayoutClient) handles keeping the
// focused field visible above the keyboard instead.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootLayoutClient>{children}</RootLayoutClient>;
}
