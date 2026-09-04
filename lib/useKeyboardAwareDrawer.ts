// lib/useKeyboardAwareDrawer.ts
'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

// Gap kept between the top of the visible (post-keyboard) area and the
// drawer's top edge once the keyboard is open.
const TOP_OFFSET_PX = 50;

// visualViewport.height also moves for the URL bar collapsing/expanding —
// only react once the shrink is big enough to actually be the keyboard.
const KEYBOARD_HEIGHT_THRESHOLD_PX = 60;

/**
 * Pins a drawer/sheet's top edge `TOP_OFFSET_PX` below the visible area and
 * its bottom edge to the top of the keyboard, while a field inside it is
 * focused and the keyboard is open — instead of leaving the sheet's normal
 * (keyboard-unaware) height and hoping the focused field happens to land
 * somewhere visible above the keyboard.
 *
 * vaul (the drawer library) has its own built-in keyboard repositioning
 * (`repositionInputs`), but it targets "keep the drawer roughly where it
 * was" rather than a fixed, predictable offset, and fighting it with a
 * second, independent scroll-into-view pass is what produced the blank
 * gaps this replaces. Callers should pass `repositionInputs={false}` to
 * vaul's `Drawer` so only this logic runs.
 */
export function useKeyboardAwareDrawer<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const el = ref.current;
    const viewport = window.visualViewport;
    if (!el || !viewport) return;

    function update() {
      if (!el || !viewport || !el.contains(document.activeElement)) {
        setStyle({});
        return;
      }
      const keyboardHeight = window.innerHeight - (viewport.height + viewport.offsetTop);
      if (keyboardHeight < KEYBOARD_HEIGHT_THRESHOLD_PX) {
        setStyle({});
        return;
      }
      setStyle({
        top: viewport.offsetTop + TOP_OFFSET_PX,
        bottom: keyboardHeight,
        marginTop: 0,
        maxHeight: 'none',
        overflowY: 'auto',
      });
    }

    function onFocusOut() {
      // The next focused element (if any) hasn't received focus yet the
      // instant this fires — defer so `document.activeElement` is settled.
      setTimeout(update, 0);
    }

    viewport.addEventListener('resize', update);
    el.addEventListener('focusin', update);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      viewport.removeEventListener('resize', update);
      el.removeEventListener('focusin', update);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return { ref, style };
}
