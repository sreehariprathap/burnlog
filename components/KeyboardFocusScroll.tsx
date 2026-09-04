// components/KeyboardFocusScroll.tsx
'use client';

import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

// vaul's drawer-open transition is 0.5s (see node_modules/vaul's injected
// CSS) — measuring before it finishes reads the input mid-slide and
// produces a stale target.
const SETTLE_DELAY_MS = 550;

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

/**
 * With `interactiveWidget: "overlays-content"` the keyboard floats over the
 * page instead of resizing the layout viewport, which avoids WKWebView's
 * scroll-to-(0,0) reset on focus. That means we now own keeping the focused
 * field visible above the keyboard ourselves, via the visualViewport resize
 * it still fires.
 *
 * `Element.scrollIntoView({block: 'center'})` isn't safe to use here: it
 * centers the field against its scroll container's full `clientHeight`,
 * which for a sheet/drawer's internal `overflow-y-auto` div is the sheet's
 * un-shrunk height (`dvh` doesn't account for the keyboard under
 * overlays-content) — not the actually-visible area above the keyboard.
 * That mismatch is what let long forms end up with a big blank gap between
 * their content and the keyboard. We measure against
 * `window.visualViewport` (which *does* correctly shrink for the keyboard)
 * instead, and move only the nearest scrollable ancestor by the exact
 * delta needed.
 */
export function KeyboardFocusScroll() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function centerFocusedField() {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(FOCUSABLE_SELECTOR)) return;

      const scrollParent = findScrollParent(active);
      if (!scrollParent) return;

      const rect = active.getBoundingClientRect();
      const visibleTop = viewport!.offsetTop;
      const visibleHeight = viewport!.height;
      const targetCenter = visibleTop + visibleHeight / 2;
      const currentCenter = rect.top + rect.height / 2;
      const delta = currentCenter - targetCenter;

      if (Math.abs(delta) < 4) return;
      scrollParent.scrollTo({ top: scrollParent.scrollTop + delta, behavior: 'smooth' });
    }

    // The keyboard animates open, so visualViewport's height settles a beat
    // after the resize event fires — wait for it (and any drawer/sheet
    // open transition) before measuring.
    let timeout: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(timeout);
      timeout = setTimeout(centerFocusedField, SETTLE_DELAY_MS);
    }

    viewport.addEventListener('resize', onResize);
    return () => {
      viewport.removeEventListener('resize', onResize);
      clearTimeout(timeout);
    };
  }, []);

  return null;
}
