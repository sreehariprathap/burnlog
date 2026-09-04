'use client';

import { BurnLogMark } from '@/components/BurnLogMark';
import { LogbookMark } from '@/components/LogbookMark';
import { FlameIcon } from '@/components/icons/animated/flame';
import { WalletIcon } from '@/components/icons/animated/wallet';
import { ClipboardCheckIcon } from '@/components/icons/animated/clipboard-check';
import { HomeAnimatedIcon } from '@/components/icons/animated/home';
import { UsersRoundIcon } from '@/components/icons/animated/users-round';
import { CartIcon } from '@/components/icons/animated/cart';
import { PlaneTakeoffIcon } from '@/components/icons/animated/plane-takeoff';
import { GraduationCapIcon } from '@/components/icons/animated/graduation-cap';
import { ShieldCheckIcon } from '@/components/icons/animated/shield-check';
import { SparklesIcon } from '@/components/icons/animated/sparkles';
import { BookTextIcon } from '@/components/icons/animated/book-text';
import { Clapperboard } from 'lucide-react';
import { useAnimatedAppIconsEnabled, APP_ICON_LETTERS } from '@/lib/animatedAppIcons';
import { appSearchColor } from '@/lib/search/registry';
import { cn } from '@/lib/utils';
import type { AppId } from '@/lib/appMode';

// Matches every *Mark component's style exactly (see LogbookMark/MoneyLogMark):
// plain bold glyph, no background badge, oversized relative to its box. A
// single letter renders at the same 1.6x used by every Mark; the two-letter
// badges (SocialLog/ShoppingLog, TaskLog/TravelLog — see APP_ICON_LETTERS)
// scale down so both characters still fit their box.
function LetterBadge({ letters, size, color, className }: { letters: string; size: number; color: string; className?: string }) {
  const isSingle = letters.length === 1;
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none', className)}
      style={{ width: size, height: size, fontSize: size * (isSingle ? 1.6 : 0.95), color }}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}

function AnimatedAppIcon({ id, size, color, className }: { id: AppId; size: number; color: string; className?: string }) {
  const props = { size, style: { color }, className };
  switch (id) {
    case 'logbook':
      return <BookTextIcon {...props} />;
    case 'burnlog':
      return <FlameIcon {...props} />;
    case 'moneylog':
      return <WalletIcon {...props} />;
    case 'tasklog':
      return <ClipboardCheckIcon {...props} />;
    case 'homelog':
      return <HomeAnimatedIcon {...props} />;
    case 'sociallog':
      return <UsersRoundIcon {...props} />;
    case 'shoppinglog':
      return <CartIcon {...props} />;
    case 'travellog':
      return <PlaneTakeoffIcon {...props} />;
    case 'learnlog':
      return <GraduationCapIcon {...props} />;
    case 'adminlog':
      return <ShieldCheckIcon {...props} />;
    case 'intellog':
      return <SparklesIcon {...props} />;
    case 'watchlog':
      return <Clapperboard {...props} />;
    default:
      return <FlameIcon {...props} />;
  }
}

/** Renders one app's icon. Animated on: every app (Logbook included) shows
 * a hover-animated Lucide icon in that app's own brand color. Animated
 * off: Logbook keeps its brand mark; every other app shows a big, bold,
 * app-colored letter in the same plain-glyph style as every *Mark
 * component. Controlled by the admin `feature:animated-app-icons` toggle
 * (AdminLog → UI → App Icons). Use this everywhere an app's icon is shown
 * — a hardcoded `<XLogMark>` won't respond to the toggle. */
export function AppIcon({ id, size, className }: { id: AppId; size: number; className?: string }) {
  const animated = useAnimatedAppIconsEnabled();
  const color = appSearchColor(id);

  if (animated) {
    return <AnimatedAppIcon id={id} size={size} color={color} className={className} />;
  }
  if (id === 'logbook') {
    return <LogbookMark size={size} className={className} />;
  }
  const letters = APP_ICON_LETTERS[id];
  if (letters) {
    return <LetterBadge letters={letters} size={size} color={color} className={className} />;
  }
  return <BurnLogMark size={size} className={className} />;
}
