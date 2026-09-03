// lib/useMountAnimation.ts
import { useEffect, type RefObject } from 'react';

interface AnimatableIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/**
 * Plays a lucide-animated icon's animation once on mount instead of its
 * default hover trigger. Attaching the ref already disables the icon's
 * built-in hover behavior (see each icon's isControlledRef check).
 */
export function useMountAnimation(ref: RefObject<AnimatableIconHandle | null>) {
  useEffect(() => {
    ref.current?.startAnimation();
  }, [ref]);
}
