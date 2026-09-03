// components/NotificationBell.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { type KeyedMutator } from 'swr';
import { BellIcon, type BellIconHandle } from '@/components/ui/bell';
import { Trash2 } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';
import { useMountAnimation } from '@/lib/useMountAnimation';

// Matches the drawer's own close transition (vaul's default
// `transform 0.5s cubic-bezier(...)`) closely enough that the sheet has
// mostly finished sliding away before the route change lands — starting a
// Next.js navigation mid-slide competes with the CSS transform animation
// for the main thread and reads as a jump/stutter.
const CLOSE_TRANSITION_MS = 300;

// Swipe past this fraction of the row's width, or fast enough, to dismiss it.
const SWIPE_DISTANCE_THRESHOLD = 0.35;
const SWIPE_VELOCITY_THRESHOLD = 500;

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  url: string;
  read: boolean;
  createdAt: string;
}

type NotificationsData = { notifications: NotificationRow[]; unreadCount: number };

async function fetchNotifications() {
  const res = await apiFetch('/api/notifications');
  if (!res.ok) throw new Error('Failed to load notifications');
  return res.json() as Promise<NotificationsData>;
}

function NotificationItem({
  n,
  onClick,
  mutate,
}: {
  n: NotificationRow;
  onClick: (n: NotificationRow) => void;
  mutate: KeyedMutator<NotificationsData>;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-80, -24, 0], [1, 0, 0]);
  const [dismissing, setDismissing] = useState(false);

  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    // Optimistically drop it from the cached list; if the delete fails,
    // resync from the server instead of leaving a phantom gap.
    await mutate(
      async (current) => {
        const res = await apiFetch(`/api/notifications/${n.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to dismiss notification');
        return current;
      },
      {
        optimisticData: (current) =>
          current
            ? { ...current, notifications: current.notifications.filter((row) => row.id !== n.id) }
            : { notifications: [], unreadCount: 0 },
        rollbackOnError: true,
        populateCache: (_result, current) =>
          current
            ? { ...current, notifications: current.notifications.filter((row) => row.id !== n.id) }
            : { notifications: [], unreadCount: 0 },
        revalidate: false,
      }
    ).catch(() => mutate());
  }

  function handleDragEnd(_event: unknown, info: { offset: { x: number }; velocity: { x: number } }) {
    const width = 320; // panel content is capped well below this; a stable threshold basis is enough
    const pastDistance = info.offset.x < -width * SWIPE_DISTANCE_THRESHOLD;
    const pastVelocity = info.velocity.x < -SWIPE_VELOCITY_THRESHOLD;
    if (pastDistance || pastVelocity) {
      animate(x, -400, { type: 'tween', duration: 0.2, ease: 'easeIn' }).then(dismiss);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-lg"
    >
      <motion.div
        style={{ opacity: deleteOpacity }}
        className="absolute inset-0 flex items-center justify-end rounded-lg bg-destructive pr-4"
      >
        <Trash2 size={18} className="text-white" />
      </motion.div>
      <motion.button
        type="button"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -400, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.08 }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        onClick={() => onClick(n)}
        className="relative flex w-full flex-col items-start gap-0.5 rounded-lg border bg-background p-3 text-left hover:bg-accent"
      >
        <p className="text-sm font-medium">{n.title}</p>
        <p className="text-sm text-muted-foreground">{n.message}</p>
        <p className="text-xs text-muted-foreground/70">{formatRelative(n.createdAt)}</p>
      </motion.button>
    </motion.div>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { profile } = useCurrentProfile();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR('notifications', fetchNotifications);
  const bellRef = useRef<BellIconHandle>(null);
  useMountAnimation(bellRef);

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
    mutate();
    if ((data?.unreadCount ?? 0) > 0) {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      mutate();
    }
  }

  function handleClickNotification(n: NotificationRow) {
    setOpen(false);
    // Let the drawer's close transition mostly finish before the route
    // change lands, so the navigation doesn't visibly compete with it.
    setTimeout(() => router.push(n.url), CLOSE_TRANSITION_MS);
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <>
      <button type="button" onClick={handleOpen} aria-label="Notifications" className="relative flex items-center justify-center">
        <BellIcon ref={bellRef} size={20} />
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
            <AnimatePresence initial={false}>
              {(data?.notifications ?? []).map((n) => (
                <NotificationItem key={n.id} n={n} onClick={handleClickNotification} mutate={mutate} />
              ))}
            </AnimatePresence>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
