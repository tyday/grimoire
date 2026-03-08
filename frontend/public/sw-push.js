// =============================================================================
// sw-push.js — Service worker push notification handler
// =============================================================================
// This file runs in the background, separate from the main app. It handles
// incoming push messages from our backend and displays them as native
// notifications.
//
// The vite-plugin-pwa generates its own service worker (sw.js) for caching.
// This file is loaded alongside it using importScripts in the PWA config.
// =============================================================================

// Listen for push events from the server
self.addEventListener('push', (event) => {
  // Parse the payload sent from our backend.
  // Wrap in try/catch because Chrome DevTools "Test Push" sends plain text,
  // not JSON, which would throw on .json().
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || '' };
  }

  const title = data.title || 'Grimoire';
  const options = {
    body: data.body || '',
    icon: '/grimoire.svg',
    badge: '/grimoire.svg',
    // Tag groups notifications — a new notification with the same tag replaces the old one
    tag: data.tag || 'grimoire-default',
    // Data is passed to the notificationclick handler below
    data: {
      url: data.url || '/',
    },
  };

  // event.waitUntil tells the browser to keep the service worker alive
  // until the notification is shown
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks — open the app or focus it if already open
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    // Check if the app is already open in a tab
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a tab is already open, focus it
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(url);
    }),
  );
});
