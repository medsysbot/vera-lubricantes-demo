const CACHE = 'vera-shell-v4';
const SHELL = [
  '/css/global.css',
  '/js/fa-solid-icons.js',
  '/js/vera-ui.js',
  '/js/client.js',
  '/js/admin.js',
  '/js/activate.js',
  '/manifest.webmanifest',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (!SHELL.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', event => {
  let data = { title: 'VERA Lubricantes', body: 'Tenés una novedad en VERA', url: '/cliente' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/cliente' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/cliente';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      for (const windowClient of windows) {
        if (windowClient.url.startsWith(self.location.origin)) {
          windowClient.navigate(url);
          return windowClient.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
