'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface PersonStackItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** 'both' draws two concentric rings (owner outermost) rather than blending colors. */
  ring?: 'owner' | 'self' | 'both';
}

const RING_COLORS = {
  owner: 'var(--warning)',
  self: 'var(--primary)',
} as const;

function ringBoxShadow(ring: PersonStackItem['ring'], gapColor: string): string | undefined {
  if (!ring) return undefined;
  if (ring === 'both') {
    return `0 0 0 2px ${RING_COLORS.self}, 0 0 0 4px ${gapColor}, 0 0 0 6px ${RING_COLORS.owner}`;
  }
  return `0 0 0 2px ${RING_COLORS[ring]}`;
}

interface PeopleStackProps {
  people: PersonStackItem[];
  max?: number;
  size?: number;
  /** Color painted into the gap of a 'both' double-ring — match the surface the stack sits on. */
  ringGapColor?: string;
  className?: string;
}

/**
 * Display-only overlapping avatar stack (real photos, not the DiceBear
 * placeholders kokonutui's team-selector uses) — no click/selection
 * behavior. See components/kokonutui/counter.tsx for the +/- control that
 * team-selector otherwise bundles with this.
 */
export function PeopleStack({ people, max = 5, size = 32, ringGapColor = 'var(--card)', className }: PeopleStackProps) {
  const shouldReduceMotion = useReducedMotion();
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  const ringPad = shown.some((p) => p.ring) ? 6 : 0;

  return (
    <div
      className={cn('flex items-center', className)}
      style={{ padding: ringPad, paddingRight: (overflow > 0 ? size * 0.4 : 0) + ringPad }}
    >
      {shown.map((person, i) => (
        <motion.div
          key={person.id}
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: shouldReduceMotion ? 0 : i * 0.04 }}
          style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: shown.length - i }}
        >
          <Avatar
            className="border-2 border-background"
            style={{ height: size, width: size, boxShadow: ringBoxShadow(person.ring, ringGapColor) }}
          >
            {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt={person.name} />}
            <AvatarFallback style={{ fontSize: size * 0.4 }}>
              {person.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </motion.div>
      ))}

      {overflow > 0 && (
        <div
          className="flex items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground"
          style={{ height: size, width: size, marginLeft: -size * 0.3, zIndex: 0 }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
