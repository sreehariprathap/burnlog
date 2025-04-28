'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { registerServiceWorker, subscribeToPushNotifications, sendTestNotification } from '@/lib/pushNotification';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';

export function PushNotificationPrompt() {
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'default'>('default');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const { toast } = useToast();

  // Check notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      // Check if notifications are supported
      if (!('Notification' in window)) {
        return;
      }
      
      setPermissionState(Notification.permission);
      
      // Get current user
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUserId(data.user.id);
        
        // Only show prompt if permission is not granted
        if (Notification.permission !== 'granted') {
          setShowPrompt(true);
        }
      }
    };
    
    checkPermission();
    
    // Also register service worker on load
    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }
  }, []);

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
        // Save subscription to supabase
        const { error } = await supabase
          .from('push_subscriptions')
          .upsert({
            user_id: userId,
            subscription_data: subscription,
            created_at: new Date().toISOString()
          });
          
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
        
        // Show a test notification
        setTimeout(() => {
          sendTestNotification();
        }, 1000);
        
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

  if (!showPrompt || permissionState === 'granted') {
    return null;
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
          Stay on track with your fitness goals by enabling push notifications. We'll send you timely reminders
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