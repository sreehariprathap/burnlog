// lib/pushNotification.ts

interface SubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: string;
}

// Function to convert the subscription object into base64 strings
export function encodeSubscription(subscription: PushSubscriptionJSON, userId: string): SubscriptionRequest {
  if (!subscription.endpoint) {
    throw new Error('Subscription endpoint is required');
  }
  
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: arrayBufferToBase64(subscription.keys?.p256dh),
      auth: arrayBufferToBase64(subscription.keys?.auth)
    },
    userId
  };
}

// URL-safe Base64 encoding
function arrayBufferToBase64(buffer: string | undefined): string {
  // If it's undefined, return an empty string
  if (buffer === undefined) {
    return '';
  }
  // If it's already a string, we assume it's already encoded
  if (typeof buffer === 'string') {
    return buffer;
  }
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(buffer)]));
}

// Function to request notification permission and register service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported by this browser');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered with scope:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

// Request permission and subscribe to push notifications
export async function subscribeToPushNotifications(
  userId: string, 
  saveSubscription: (subscription: SubscriptionRequest) => Promise<void>
): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    const registered = await registerServiceWorker();
    if (!registered) return false;

    // register() resolves as soon as registration exists, not once it's active - subscribing
    // against it directly races the install/activate lifecycle on a fresh install and throws
    // "Subscription failed - no active Service Worker". navigator.serviceWorker.ready only
    // resolves once there's an active worker.
    const registration = await navigator.serviceWorker.ready;

    // Check if we already have a subscription
    let subscription = await registration.pushManager.getSubscription();
    
    // If no subscription exists, create one
    if (!subscription) {
      // You would need to replace this with your actual VAPID public key
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
      
      if (!vapidPublicKey) {
        console.error('VAPID public key is missing');
        return false;
      }

      // Convert the VAPID key to the format required by the push manager
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    // Save the subscription to your server
    await saveSubscription(encodeSubscription(subscription.toJSON(), userId));
    return true;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return false;
  }
}

// Helper function to convert a base64 string to a Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Calls the real server-side push endpoint - unlike sendTestNotification, this exercises
// actual delivery through the service worker's push handler.
export async function sendRealTestNotification(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'burnlog Test',
        message: 'This is a real push notification from burnlog!',
        url: '/dashboard',
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || body.message || 'Failed to send test notification' };
    }
    if (!body.success) {
      return { success: false, error: 'No devices received the notification' };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test notification',
    };
  }
}
