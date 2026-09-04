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
import { useAnimatedAppIconsEnabled, APP_ICON_LETTERS } from '@/lib/animatedAppIcons';
import type { AppId } from '@/lib/appMode';

function LetterBadge({ letters, size }: { letters: string; size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letters}
    </div>
  );
}

function AnimatedAppIcon({ id, size }: { id: AppId; size: number }) {
  switch (id) {
    case 'burnlog':
      return <FlameIcon size={size} />;
    case 'moneylog':
      return <WalletIcon size={size} />;
    case 'tasklog':
      return <ClipboardCheckIcon size={size} />;
    case 'homelog':
      return <HomeAnimatedIcon size={size} />;
    case 'sociallog':
      return <UsersRoundIcon size={size} />;
    case 'shoppinglog':
      return <CartIcon size={size} />;
    case 'travellog':
      return <PlaneTakeoffIcon size={size} />;
    case 'learnlog':
      return <GraduationCapIcon size={size} />;
    case 'adminlog':
      return <ShieldCheckIcon size={size} />;
    case 'intellog':
      return <SparklesIcon size={size} />;
    default:
      return <FlameIcon size={size} />;
  }
}

/** Renders one app's icon — Logbook always keeps its own brand mark; every
 * other app renders as either an animated Lucide icon or a plain letter
 * badge, per the admin-controlled `feature:animated-app-icons` toggle
 * (AdminLog → UI → App Icons). */
export function AppIcon({ id, size }: { id: AppId; size: number }) {
  const animated = useAnimatedAppIconsEnabled();

  if (id === 'logbook') {
    return <LogbookMark size={size} />;
  }
  if (animated) {
    return <AnimatedAppIcon id={id} size={size} />;
  }
  const letters = APP_ICON_LETTERS[id];
  if (letters) {
    return <LetterBadge letters={letters} size={size} />;
  }
  return <BurnLogMark size={size} />;
}
