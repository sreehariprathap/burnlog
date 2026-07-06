'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { registerServiceWorker, subscribeToPushNotifications, sendRealTestNotification } from '@/lib/pushNotification';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from '@/components/ui/use-toast';

type Platform = { isIOS: boolean; isStandalone: boolean };

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return { isIOS, isStandalone };
}

export function PushNotificationPrompt() {
  const supabase = createClientComponentClient();
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'default'>('default');
  const [loading, setLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkPermission = async () => {
      if (!('Notification' in window)) {
        return;
      }

      setPlatform(detectPlatform());
      setPermissionState(Notification.permission);

      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUserId(data.user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('isAdmin')
          .eq('userId', data.user.id)
          .single();
        setIsAdmin(!!profile?.isAdmin);

        if (Notification.permission !== 'granted') {
          setShowPrompt(true);
        }
      }
    };

    checkPermission();

    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }
  }, [supabase]);

  const handleEnableNotifications = async () => {
    if (!userId) {
      toast({
        title: "User not logged in",
        description: "You need to be logged in to enable notifications",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const success = await subscribeToPushNotifications(userId, async (subscription) => {
        const { error } = await supabase
          .from('push_subscriptions')
          .upsert({
            user_id: userId,
            subscription_data: subscription,
            created_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) {
          console.error("Error saving subscription:", error);
          throw error;
        }
      });

      if (success) {
        setPermissionState('granted');
        toast({
          title: "Notifications enabled!",
          description: "You'll now receive workout reminders and updates",
        });
        setShowPrompt(false);
      } else {
        toast({
          title: "Couldn't enable notifications",
          description: "Please check your browser settings and try again",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      toast({
        title: "Error",
        description: "Something went wrong while enabling notifications",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTestSending(true);
    const result = await sendRealTestNotification();
    if (result.success) {
      toast({ title: "Test push sent", description: "Check for a real notification on this device." });
    } else {
      toast({ title: "Test push failed", description: result.error || "Unknown error", variant: "destructive" });
    }
    setTestSending(false);
  };

  if (!platform) return null;

  if (permissionState === 'granted') {
    if (!isAdmin) return null;
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Send Test Push</CardTitle>
          <CardDescription>Admin only - verify real push delivery</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={handleSendTestPush} disabled={testSending}>
            {testSending ? 'Sending...' : 'Send Test Push'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!showPrompt) return null;

  if (platform.isIOS && !platform.isStandalone) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Enable Notifications</CardTitle>
          <CardDescription>Add burnlog to your Home Screen first</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            iOS only supports notifications for apps added to your Home Screen. Tap the Share
            button in Safari, then &quot;Add to Home Screen&quot;. Once installed, open burnlog
            from your Home Screen and come back here to enable notifications.
          </p>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button variant="outline" onClick={() => setShowPrompt(false)}>
            Got it
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Enable Notifications</CardTitle>
        <CardDescription>
          Get reminders about your scheduled workouts and progress updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Stay on track with your fitness goals by enabling push notifications. We&apos;ll send you timely reminders
          for your workout sessions and celebrate your achievements.
        </p>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setShowPrompt(false)}>
          Maybe Later
        </Button>
        <Button onClick={handleEnableNotifications} disabled={loading}>
          {loading ? 'Enabling...' : 'Enable Notifications'}
        </Button>
      </CardFooter>
    </Card>
  );
}
