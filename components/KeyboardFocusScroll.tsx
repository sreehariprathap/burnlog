// components/KeyboardFocusScroll.tsx
'use client';

import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

/**
 * With `interactiveWidget: "overlays-content"` the keyboard floats over the
 * page instead of resizing the layout viewport, which avoids WKWebView's
 * scroll-to-(0,0) reset on focus. That means we now own keeping the focused
 * field visible above the keyboard ourselves, via the visualViewport resize
 * it still fires.
 */
export function KeyboardFocusScroll() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function scrollFocusedIntoView() {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(FOCUSABLE_SELECTOR)) return;
      active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // The keyboard animates open, so visualViewport's height settles a beat
    // after the resize event fires — wait for it before measuring.
    let timeout: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(timeout);
      timeout = setTimeout(scrollFocusedIntoView, 120);
    }

    viewport.addEventListener('resize', onResize);
    return () => {
      viewport.removeEventListener('resize', onResize);
      clearTimeout(timeout);
    };
  }, []);

  return null;
}
