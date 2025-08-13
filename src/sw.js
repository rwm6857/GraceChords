importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const CACHE_NAME = 'gracechords-v2';

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('gracechords') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (shouldCache(request, response)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

function shouldCache(request, response) {
  return (
    response && response.ok &&
    (request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      request.destination === 'document' ||
      request.url.includes('/assets/') ||
      request.url.includes('/src/data/') ||
      request.url.includes('/songs/'))
  );
}
