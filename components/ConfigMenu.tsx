'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { SettingsIcon, type SettingsIconHandle } from '@/components/ui/settings';
import { cn } from '@/lib/utils';
import { useMountAnimation } from '@/lib/useMountAnimation';

type ConfigMenuProps = {
  href: string;
  isActive: boolean;
  navId: string;
};

export function ConfigMenu({ href, isActive, navId }: ConfigMenuProps) {
  const settingsRef = useRef<SettingsIconHandle>(null);
  useMountAnimation(settingsRef);

  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {isActive && (
        <motion.span
          layoutId={navId}
          className="absolute inset-0 rounded-full bg-primary/10"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <SettingsIcon ref={settingsRef} size={20} className="relative z-10 mb-0.5" />
      <span className="relative z-10">Config</span>
    </Link>
  );
}
