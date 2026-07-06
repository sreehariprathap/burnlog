import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// "/" - same NetworkFirst + opaqueredirect workaround next-pwa's default template used
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname === '/',
  new NetworkFirst({
    cacheName: 'start-url',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          response && response.type === 'opaqueredirect'
            ? new Response(response.body, { status: 200, statusText: 'OK', headers: response.headers })
            : response,
      },
    ],
  })
);

registerRoute(
  ({ url }) => /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:eot|otf|ttc|ttf|woff|woff2|font\.css)$/i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'static-font-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:jpg|jpeg|gif|png|webp|svg|ico)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'static-image-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:js|css)$/i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'static-js-css-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 })],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 60 * 5 })],
  })
);

// Catch-all - must be registered last (Workbox matches routes in registration order)
registerRoute(
  () => true,
  new NetworkFirst({
    cacheName: 'others',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 })],
  })
);

const FALLBACK_URLS = {
  document: '/offline',
  image: '/B.png',
  audio: '/offline',
  video: '/offline',
  font: '/offline',
};

setCatchHandler(async ({ request }) => {
  const fallbackUrl = FALLBACK_URLS[request.destination];
  if (fallbackUrl) {
    const cached = await caches.match(fallbackUrl);
    if (cached) return cached;
  }
  return Response.error();
});

self.addEventListener('push', (event) => {
  let payload = { title: 'burnlog Notification', message: 'You have a new notification', url: '/' };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Malformed/non-JSON payload - keep the generic fallback above
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.message,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      try {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = allClients.find((client) => new URL(client.url).origin === self.location.origin);

        if (existing) {
          await existing.focus();
          if (new URL(existing.url).pathname !== targetUrl) {
            await existing.navigate(targetUrl);
          }
          return;
        }

        await self.clients.openWindow(targetUrl);
      } catch (err) {
        console.error('notificationclick handling failed:', err);
      }
    })()
  );
});
