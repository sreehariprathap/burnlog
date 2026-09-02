'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { registerServiceWorker, subscribeToPushNotifications } from '@/lib/pushNotification';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';

type Platform = { isIOS: boolean; isStandalone: boolean };

const DISMISS_KEY = 'notif-prompt-dismissed-at';
const SNOOZE_DAYS = 7;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return { isIOS, isStandalone };
}

function isSnoozed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < SNOOZE_DAYS;
}

/** Global "enable push notifications" prompt — mounted once in
 * RootLayoutClient so every app (not just one sub-app) asks. Dismissing
 * snoozes for a week via localStorage rather than nagging on every page
 * load; accepting or already-granted never shows it again. */
export function EnableNotificationsPrompt() {
  const supabase = createClient();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [loading, setLoading] = useState(false);

  const saveSubscription = useCallback(async (subscription: Parameters<Parameters<typeof subscribeToPushNotifications>[1]>[0]) => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return;
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: data.user.id,
          endpoint: subscription.endpoint,
          subscription_data: subscription,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );
    if (error) {
      console.error('Error saving subscription:', error);
      throw error;
    }
  }, [supabase]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }

    (async () => {
      const detected = detectPlatform();
      setPlatform(detected);

      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;
      setUserId(data.user.id);

      const hasNotificationAPI = 'Notification' in window;

      if (detected.isIOS && !detected.isStandalone) {
        if (!isSnoozed()) {
          setShowIosInstructions(true);
          setShowPrompt(true);
        }
        return;
      }

      if (!hasNotificationAPI) return;

      if (Notification.permission === 'granted') {
        // Permission was already granted in a prior session — the subscription row may be
        // missing (never saved, or pruned server-side after going stale), so self-heal.
        subscribeToPushNotifications(data.user.id, saveSubscription);
        return;
      }

      if (Notification.permission === 'default' && !isSnoozed()) {
        setShowPrompt(true);
      }
    })();
  }, [supabase, saveSubscription]);

  async function handleEnable() {
    if (!userId) return;
    setLoading(true);
    try {
      const success = await subscribeToPushNotifications(userId, saveSubscription);
      if (success) {
        toast({ description: "Notifications enabled — you'll get updates across every app." });
        setShowPrompt(false);
      } else {
        toast({ title: "Couldn't enable notifications", description: 'Check your browser settings and try again.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast({ title: 'Error', description: 'Something went wrong enabling notifications.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowPrompt(false);
  }

  if (!showPrompt || !platform) return null;

  if (showIosInstructions) {
    return (
      <div className="fixed bottom-24 left-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 bg-primary rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">Enable notifications</p>
            <p className="text-xs text-muted-foreground mt-1">
              iOS only supports notifications for installed apps. Tap the Share button in Safari,
              then &quot;Add to Home Screen&quot; — then open it from your Home Screen to enable notifications.
            </p>
          </div>
          <Button onClick={handleDismiss} variant="ghost" size="sm" className="p-1 shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 shrink-0 bg-primary rounded-lg flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground">Stay updated</p>
          <p className="text-xs text-muted-foreground">Enable notifications across every app</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button onClick={handleEnable} size="sm" className="text-xs" disabled={loading}>
          {loading ? 'Enabling…' : 'Enable'}
        </Button>
        <Button onClick={handleDismiss} variant="ghost" size="sm" className="p-1">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
