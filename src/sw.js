// Include the current commit SHA in the cache name so that each deploy
// invalidates previously cached assets and clients fetch the latest files.
const CACHE_NAME = `gracechords-${import.meta.env.VITE_COMMIT_SHA || 'dev'}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/data/index.json',
  '/fonts/NotoSans-Regular.ttf',
  '/fonts/NotoSans-Bold.ttf',
  '/fonts/NotoSans-Italic.ttf',
  '/fonts/NotoSans-BoldItalic.ttf',
  '/fonts/NotoSansMono-Regular.ttf',
  '/fonts/NotoSansMono-Bold.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
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
      // Cache individual song files
      request.url.includes('/songs/'))
  );
}
