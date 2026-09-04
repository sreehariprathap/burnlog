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
import { useAnimatedAppIconsEnabled, APP_ICON_LETTERS } from '@/lib/animatedAppIcons';
import { appSearchColor } from '@/lib/search/registry';
import type { AppId } from '@/lib/appMode';

function LetterBadge({ letters, size, color }: { letters: string; size: number; color: string }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.5, color }}
    >
      {letters}
    </div>
  );
}

function AnimatedAppIcon({ id, size, color }: { id: AppId; size: number; color: string }) {
  const style = { color };
  switch (id) {
    case 'logbook':
      return <BookTextIcon size={size} style={style} />;
    case 'burnlog':
      return <FlameIcon size={size} style={style} />;
    case 'moneylog':
      return <WalletIcon size={size} style={style} />;
    case 'tasklog':
      return <ClipboardCheckIcon size={size} style={style} />;
    case 'homelog':
      return <HomeAnimatedIcon size={size} style={style} />;
    case 'sociallog':
      return <UsersRoundIcon size={size} style={style} />;
    case 'shoppinglog':
      return <CartIcon size={size} style={style} />;
    case 'travellog':
      return <PlaneTakeoffIcon size={size} style={style} />;
    case 'learnlog':
      return <GraduationCapIcon size={size} style={style} />;
    case 'adminlog':
      return <ShieldCheckIcon size={size} style={style} />;
    case 'intellog':
      return <SparklesIcon size={size} style={style} />;
    default:
      return <FlameIcon size={size} style={style} />;
  }
}

/** Renders one app's icon. Animated on: every app (Logbook included) shows
 * a hover-animated Lucide icon in that app's own brand color. Animated
 * off: Logbook keeps its brand mark; every other app shows a big, bold,
 * app-colored letter badge. Controlled by the admin `feature:animated-app-icons`
 * toggle (AdminLog → UI → App Icons). */
export function AppIcon({ id, size }: { id: AppId; size: number }) {
  const animated = useAnimatedAppIconsEnabled();
  const color = appSearchColor(id);

  if (animated) {
    return <AnimatedAppIcon id={id} size={size} color={color} />;
  }
  if (id === 'logbook') {
    return <LogbookMark size={size} />;
  }
  const letters = APP_ICON_LETTERS[id];
  if (letters) {
    return <LetterBadge letters={letters} size={size} color={color} />;
  }
  return <BurnLogMark size={size} />;
}
