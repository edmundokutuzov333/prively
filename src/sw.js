/* global self */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Actividade na tua conta';
  const body = typeof payload.body === 'string' ? payload.body : 'Abre a Prively para veres a actividade.';
  const url = typeof payload.url === 'string' ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === 'string' ? payload.tag : 'prively-notification',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url },
      renotify: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => 'focus' in client);
      if (existing) {
        return existing.navigate(url).then((client) => client?.focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});
