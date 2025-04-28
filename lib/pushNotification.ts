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
function arrayBufferToBase64(buffer: string): string {
  // If it's already a string, we assume it's already encoded
  if (typeof buffer === 'string') {
    return buffer;
  }
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
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

    const registration = await registerServiceWorker();
    if (!registration) return false;

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
function urlBase64ToUint8Array(base64String: string): Uint8Array {
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

// Function to send a test notification
export async function sendTestNotification() {
  if (!('Notification' in window)) {
    alert('This browser does not support notifications');
    return;
  }

  if (Notification.permission !== 'granted') {
    alert('Please enable notifications first');
    return;
  }

  // This would normally be handled by your server
  // But for testing, we can trigger it directly
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    registration.showNotification('burnlog Test', {
      body: 'This is a test notification from burnlog!',
      icon: '/B.png',
      badge: '/B.png',
      vibrate: [100, 50, 100],
      data: {
        url: '/dashboard'
      }
    });
  }
}