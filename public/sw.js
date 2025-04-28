// This service worker is generated/managed by next-pwa
// It uses workbox behind the scenes

// Cache name with version
const CACHE_NAME = 'gymlog-cache-v1';

// Assets to precache on installation
const PRECACHE_ASSETS = [
  '/',
  '/dashboard',
  '/goals',
  '/session',
  '/profile',
  '/B.png',
  '/burnlog-icon-splash.png',
];

// Installation event - precaches our essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache if available, fall back to network
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip non-http(s) requests
  if (!event.request.url.startsWith('http')) return;

  // Don't cache API calls
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached response if found
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Return the response if invalid or not a GET
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response since it can only be consumed once
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // If fetch fails (offline), try to return the cached index page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
            return null;
          });
      })
  );
});

// Push notifications handler
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.message || 'New notification from Gymlog',
      icon: '/B.png',
      badge: '/B.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Gymlog Notification', options)
    );
  } catch (error) {
    // Fallback for non-JSON push messages
    const options = {
      body: event.data.text() || 'New notification from Gymlog',
      icon: '/B.png',
      badge: '/B.png',
      vibrate: [100, 50, 100]
    };
    
    event.waitUntil(
      self.registration.showNotification('Gymlog Notification', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then((clientList) => {
        // Check if a window is already open and navigate to our URL
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
