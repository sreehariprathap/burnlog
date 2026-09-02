// components/NotificationBell.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  url: string;
  read: boolean;
  createdAt: string;
}

async function fetchNotifications() {
  const res = await apiFetch('/api/notifications');
  if (!res.ok) throw new Error('Failed to load notifications');
  return res.json() as Promise<{ notifications: NotificationRow[]; unreadCount: number }>;
}

export function NotificationBell() {
  const router = useRouter();
  const { profile } = useCurrentProfile();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR('notifications', fetchNotifications);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profileId=eq.${profile.id}` },
        () => {
          mutate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, mutate]);

  async function handleOpen() {
    setOpen(true);
    if ((data?.unreadCount ?? 0) > 0) {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      mutate();
    }
  }

  function handleClickNotification(n: NotificationRow) {
    setOpen(false);
    router.push(n.url);
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <>
      <button type="button" onClick={handleOpen} aria-label="Notifications" className="relative flex items-center justify-center">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Notifications</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {(data?.notifications.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No notifications yet.</p>
            )}
            {(data?.notifications ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClickNotification(n)}
                className="flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left hover:bg-accent"
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground/70">{formatRelative(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
