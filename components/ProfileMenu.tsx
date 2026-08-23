'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { motion } from 'motion/react';
import { UserIcon, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ProfileMenuProps = {
  isActive: boolean;
};

export function ProfileMenu({ isActive }: ProfileMenuProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {isActive && (
            <motion.span
              layoutId="bottom-nav-active"
              className="absolute inset-0 rounded-full bg-primary/10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <UserIcon className="relative z-10 mb-0.5 h-5 w-5" />
          <span className="relative z-10">Profile</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center">
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <UserIcon className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
